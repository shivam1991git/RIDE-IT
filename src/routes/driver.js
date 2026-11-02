const express = require('express');
const mongoose = require('mongoose');
const { Booking } = require('../models/Booking');
const { Driver, publicRating } = require('../models/accounts');
const { requireAuth } = require('../middleware/auth');
const { validate, limiter, idParams } = require('../middleware/common');
const { transition } = require('../services/bookings');
const { loadForViewer } = require('./booking');
const v = require('../validation');
const { asyncHandler, badRequest, forbidden } = require('../utils/http');
const { haversineKm, round } = require('../utils/geo');

const router = express.Router();
const { z } = v;

router.use(requireAuth('driver'));

async function currentDriver(req) {
    const driver = await Driver.findById(req.auth.id);
    if (!driver) throw forbidden();
    return driver;
}

function requireApproved(driver) {
    if (driver.status !== 'approved') {
        throw forbidden(driver.status === 'pending'
            ? 'Your profile is awaiting verification by our team'
            : 'Your driver account is not active');
    }
}

router.get('/summary', asyncHandler(async (req, res) => {
    const driver = await currentDriver(req);
    const id = new mongoose.Types.ObjectId(req.auth.id);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [totals] = await Booking.aggregate([
        { $match: { driver: id, status: 'completed' } },
        {
            $group: {
                _id: null,
                trips: { $sum: 1 },
                earnings: { $sum: '$totalAmount' },
                todayEarnings: { $sum: { $cond: [{ $gte: ['$updatedAt', startOfDay] }, '$totalAmount', 0] } },
                todayTrips: { $sum: { $cond: [{ $gte: ['$updatedAt', startOfDay] }, 1, 0] } },
                weekEarnings: { $sum: { $cond: [{ $gte: ['$updatedAt', weekAgo] }, '$totalAmount', 0] } },
                distanceKm: { $sum: { $ifNull: ['$distanceKm', 0] } },
            },
        },
    ]);
    const daily = await Booking.aggregate([
        { $match: { driver: id, status: 'completed', updatedAt: { $gte: weekAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'Asia/Kolkata' } }, earnings: { $sum: '$totalAmount' }, trips: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    const active = await Booking.findOne({ driver: id, activeDriver: true }).select('_id').lean();

    res.json({
        driver: driver.toJSON(),
        stats: {
            trips: totals?.trips || 0,
            earnings: totals?.earnings || 0,
            todayEarnings: totals?.todayEarnings || 0,
            todayTrips: totals?.todayTrips || 0,
            weekEarnings: totals?.weekEarnings || 0,
            distanceKm: round(totals?.distanceKm || 0, 1),
        },
        daily,
        activeBookingId: active?._id || null,
    });
}));

router.patch('/availability', validate({
    body: z.object({ isOnline: z.boolean(), location: z.object({ lat: z.number(), lng: z.number() }).optional() }),
}), asyncHandler(async (req, res) => {
    const driver = await currentDriver(req);
    if (req.body.isOnline) {
        requireApproved(driver);
        if (!driver.vehicle?.category) throw badRequest('Add your vehicle details before going online');
    }
    driver.isOnline = req.body.isOnline;
    if (req.body.location) driver.lastLocation = { ...req.body.location, at: new Date() };
    await driver.save();
    res.json({ driver: driver.toJSON() });
}));

const locationLimiter = limiter({ windowMs: 60 * 1000, limit: 30 });

router.post('/location', locationLimiter, validate({
    body: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
}), asyncHandler(async (req, res) => {
    await Driver.updateOne({ _id: req.auth.id }, { $set: { lastLocation: { ...req.body, at: new Date() } } });
    res.json({ ok: true });
}));

router.patch('/vehicle', validate({ body: v.vehicle }), asyncHandler(async (req, res) => {
    const driver = await currentDriver(req);
    const active = await Booking.exists({ driver: driver._id, activeDriver: true });
    if (active) throw badRequest('Finish your current trip before changing vehicles');
    driver.vehicle = req.body;
    await driver.save();
    res.json({ driver: driver.toJSON() });
}));

// Open ride requests in the driver's category plus rentals that need a driver.
router.get('/requests', asyncHandler(async (req, res) => {
    const driver = await currentDriver(req);
    if (driver.status !== 'approved') return res.json({ rides: [], rentals: [], reason: 'not_approved' });

    const [rides, rentals] = await Promise.all([
        driver.isOnline && driver.vehicle?.category
            ? Booking.find({ type: 'ride', status: 'requested', category: driver.vehicle.category }).sort({ createdAt: 1 }).limit(20).populate('user', 'fullName rating')
            : [],
        Booking.find({ type: 'rental', status: 'pending_driver', start: { $gt: new Date() } }).sort({ start: 1 }).limit(20).populate('car', 'name image').populate('user', 'fullName rating'),
    ]);

    const origin = driver.lastLocation?.lat ? driver.lastLocation : null;
    const strip = booking => {
        const json = booking.toJSON();
        json.user = { fullName: (booking.user?.fullName || 'Customer').split(' ')[0], rating: publicRating(booking.user?.rating) };
        if (origin && booking.pickup) json.pickupDistanceKm = round(haversineKm(origin, booking.pickup), 1);
        return json;
    };
    const rideList = rides.map(strip);
    if (origin) rideList.sort((a, b) => (a.pickupDistanceKm ?? 99) - (b.pickupDistanceKm ?? 99));
    res.json({ rides: rideList, rentals: rentals.map(strip), online: driver.isOnline });
}));

router.get('/active', asyncHandler(async (req, res) => {
    const active = await Booking.findOne({ driver: req.auth.id, activeDriver: true }).select('_id').lean();
    res.json({ booking: active ? await loadForViewer(active._id, req.auth) : null });
}));

const respond = (req, res) => async booking => res.json({ booking: await loadForViewer(booking._id, req.auth) });

router.post('/bookings/:id/accept', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const driver = await currentDriver(req);
    requireApproved(driver);
    const booking = await transition(req.params.id, 'accept', req.auth, {
        guard: async current => {
            if (current.type === 'ride') {
                if (!driver.isOnline) throw badRequest('Go online to accept rides');
                if (driver.vehicle?.category !== current.category) throw forbidden('This ride needs a different vehicle category');
            }
        },
        // Only live rides hold the one-active-job lock; rentals are scheduled ahead.
        set: current => ({ driver: driver._id, ...(current.type === 'ride' ? { activeDriver: true } : {}) }),
    });
    return respond(req, res)(booking);
}));

router.post('/bookings/:id/release', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'release', req.auth, { unset: { driver: 1, activeDriver: 1 } });
    res.json({ booking: { _id: booking._id, status: booking.status } });
}));

router.post('/bookings/:id/arrive', validate({ params: idParams }), asyncHandler(async (req, res) => {
    return respond(req, res)(await transition(req.params.id, 'arrive', req.auth));
}));

// The PIN is a 4-digit code, so attempts are capped per driver.
const pinLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, keyGenerator: req => `pin:${req.auth.id}`, message: 'Too many PIN attempts. Ask the rider to confirm their PIN.' });

router.post('/bookings/:id/start', pinLimiter, validate({
    params: idParams,
    body: z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits') }),
}), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'start', req.auth, {
        guard: async current => {
            if (current.pin !== req.body.pin) throw badRequest('That PIN does not match. Ask the rider for the PIN shown in their app.');
        },
    });
    return respond(req, res)(booking);
}));

router.post('/bookings/:id/complete', validate({
    params: idParams,
    body: z.object({ cashCollected: z.boolean().optional() }),
}), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'complete', req.auth, {
        guard: async current => {
            if (current.type === 'rental' && current.start > new Date()) throw badRequest('This rental has not started yet');
            if (current.payment?.method === 'cash' && current.payment.status !== 'paid' && !req.body.cashCollected) {
                throw badRequest('Confirm that you collected the cash payment');
            }
        },
        set: current => (current.payment?.method === 'cash'
            ? { 'payment.status': 'paid', 'payment.paidAt': new Date() }
            : {}),
    });
    return respond(req, res)(booking);
}));

module.exports = router;
