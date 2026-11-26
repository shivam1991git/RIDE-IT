const express = require('express');
const mongoose = require('mongoose');
const { config } = require('../../config/env');
const { Booking } = require('../bookings/booking.model');
const { Driver, publicRating } = require('../accounts/account.model');
const { SupportTicket } = require('../support/support-ticket.model');
const { requireAuth } = require('../../core/middleware/auth.middleware');
const { validate, limiter, idParams } = require('../../core/middleware/request.middleware');
const { transition } = require('../bookings/booking-lifecycle.service');
const rentals = require('../rentals/rental.service');
const { completeRental } = require('../rentals/rental-operations.service');
const { broadcastBooking } = require('../notifications/notification.service');
const { audit } = require('../audit/audit.service');
const { loadForViewer } = require('../bookings/booking-viewer.service');
const { notifyOperations } = require('../rentals/rental.routes');
const v = require('../../core/validation');
const { asyncHandler, badRequest, forbidden, notFound, conflict } = require('../../core/http');
const { haversineKm, round } = require('../../core/geo-math');

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

// Trip value credited to the driver: the final bill for chauffeur trips; for
// rides, the fare before any promo (promos are funded by RIDE-IT, not the driver).
const EARNING = { $ifNull: ['$finalAmount', { $add: ['$totalAmount', { $ifNull: ['$promo.discount', 0] }] }] };

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
                earnings: { $sum: EARNING },
                todayEarnings: { $sum: { $cond: [{ $gte: ['$updatedAt', startOfDay] }, EARNING, 0] } },
                todayTrips: { $sum: { $cond: [{ $gte: ['$updatedAt', startOfDay] }, 1, 0] } },
                weekEarnings: { $sum: { $cond: [{ $gte: ['$updatedAt', weekAgo] }, EARNING, 0] } },
                // Chauffeur trips record the real distance driven; rides use the route estimate.
                distanceKm: { $sum: { $ifNull: ['$settlement.actualKm', { $ifNull: ['$distanceKm', 0] }] } },
            },
        },
    ]);
    const daily = await Booking.aggregate([
        { $match: { driver: id, status: 'completed', updatedAt: { $gte: weekAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'Asia/Kolkata' } }, earnings: { $sum: EARNING }, trips: { $sum: 1 } } },
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

    // Chauffeur trips are assigned by operations (see /assignments), never picked from a pool.
    const rides = config.ridesEnabled && driver.isOnline && driver.vehicle?.category
        ? await Booking.find({ type: 'ride', status: 'requested', category: driver.vehicle.category }).sort({ createdAt: 1 }).limit(20).populate('user', 'fullName rating')
        : [];

    const origin = driver.lastLocation?.lat ? driver.lastLocation : null;
    const strip = booking => {
        const json = booking.toJSON();
        json.user = { fullName: (booking.user?.fullName || 'Customer').split(' ')[0], rating: publicRating(booking.user?.rating) };
        if (origin && booking.pickup) json.pickupDistanceKm = round(haversineKm(origin, booking.pickup), 1);
        return json;
    };
    const rideList = rides.map(strip);
    if (origin) rideList.sort((a, b) => (a.pickupDistanceKm ?? 99) - (b.pickupDistanceKm ?? 99));
    res.json({ rides: rideList, rentals: [], online: driver.isOnline });
}));

router.get('/active', asyncHandler(async (req, res) => {
    const active = await Booking.findOne({ driver: req.auth.id, activeDriver: true }).select('_id').lean();
    res.json({ booking: active ? await loadForViewer(active._id, req.auth) : null });
}));

const respond = (req, res) => async booking => res.json({ booking: await loadForViewer(booking._id, req.auth) });

router.post('/bookings/:id/accept', validate({ params: idParams }), asyncHandler(async (req, res) => {
    if (!config.ridesEnabled) throw notFound('Instant rides are not available. Chauffeur trips are assigned by our operations team.');
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

// Chauffeurs can report arrival from this long before the pickup time.
const ARRIVE_WINDOW_HOURS = 3;

router.post('/bookings/:id/arrive', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'arrive', req.auth, {
        guard: async current => {
            if (current.type !== 'rental') return;
            if (new Date(current.start).getTime() - Date.now() > ARRIVE_WINDOW_HOURS * rentals.HOUR) {
                throw badRequest(`You can mark arrival from ${ARRIVE_WINDOW_HOURS} hours before pickup (${rentals.formatDateTime(current.start)})`);
            }
        },
        // Arriving also counts as acknowledging, and takes the one-active-trip lock.
        set: current => (current.type === 'rental'
            ? { activeDriver: true, ...(current.assignment?.acknowledgedAt ? {} : { 'assignment.acknowledgedAt': new Date() }) }
            : {}),
    });
    return respond(req, res)(booking);
}));

// The PIN is a 4-digit code, so attempts are capped per driver.
const pinLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, keyGenerator: req => `pin:${req.auth.id}`, message: 'Too many PIN attempts. Ask the rider to confirm their PIN.' });

router.post('/bookings/:id/start', pinLimiter, validate({
    params: idParams,
    body: z.object({
        pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
        startOdometer: z.number().min(0, 'Odometer reading cannot be negative').max(9999999).optional(),
    }),
}), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'start', req.auth, {
        guard: async current => {
            if (current.type === 'rental' && current.rentalType && req.body.startOdometer === undefined) {
                throw badRequest('Enter the odometer reading before starting the trip');
            }
            if (current.pin !== req.body.pin) throw badRequest('That PIN does not match. Ask the customer for the PIN shown in their app.');
        },
        set: current => (current.type === 'rental'
            ? { 'trip.startOdometer': req.body.startOdometer, 'trip.startedAt': new Date() }
            : {}),
    });
    return respond(req, res)(booking);
}));

const completionBody = z.object({
    // Rides and v2 rentals: confirm cash was collected.
    cashCollected: z.boolean().optional(),
    // Chauffeur trips: closing odometer, costs paid at actuals and money collected.
    endOdometer: z.number().min(0).max(9999999).optional(),
    tolls: z.number().min(0).max(50000).default(0),
    parking: z.number().min(0).max(10000).default(0),
    collected: z.object({
        amount: z.number().min(0).max(500000),
        method: z.enum(['cash', 'upi']),
        reference: z.string().trim().max(60).optional(),
    }).optional(),
});

router.post('/bookings/:id/complete', validate({ params: idParams, body: completionBody }), asyncHandler(async (req, res) => {
    const existing = await Booking.findOne({ _id: req.params.id, driver: req.auth.id }).select('type rentalType').lean();
    if (!existing) throw notFound('Booking not found');
    if (existing.type === 'rental' && existing.rentalType) {
        const me = await Driver.findById(req.auth.id).select('fullName').lean();
        return respond(req, res)(await completeRental(req.params.id, req.auth, req.body, me?.fullName));
    }
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

// ---------- Chauffeur assignments ----------

router.get('/assignments', asyncHandler(async (req, res) => {
    const [upcoming, recent] = await Promise.all([
        Booking.find({ type: 'rental', driver: req.auth.id, status: { $in: ['confirmed', 'arrived', 'in_progress'] } })
            .sort({ start: 1 }).limit(30)
            .populate('car', 'name image registrationNumber category')
            .populate('user', 'fullName phoneNumber rating'),
        Booking.find({ type: 'rental', driver: req.auth.id, status: { $in: ['completed', 'cancelled'] } })
            .sort({ start: -1 }).limit(10)
            .populate('car', 'name registrationNumber'),
    ]);
    res.json({ upcoming, recent });
}));

async function ownAssignment(id, driverId) {
    const booking = await Booking.findOne({ _id: id, type: 'rental', driver: driverId }).lean();
    if (!booking) throw notFound('Assignment not found');
    return booking;
}

router.post('/bookings/:id/acknowledge', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await ownAssignment(req.params.id, req.auth.id);
    if (booking.status !== 'confirmed') throw conflict('Only upcoming trips can be acknowledged', 'invalid_state');
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, driver: req.auth.id, status: 'confirmed', 'assignment.acknowledgedAt': null },
        { $set: { 'assignment.acknowledgedAt': new Date() }, $push: { timeline: { status: 'confirmed', by: 'driver', note: 'Driver acknowledged the assignment' } } },
        { new: true },
    );
    if (!updated) throw conflict('You have already acknowledged this trip', 'already_acknowledged');
    broadcastBooking(updated);
    await audit(req, 'booking.acknowledge', 'booking', updated._id);
    return respond(req, res)(updated);
}));

// The driver cannot do the trip: operations is alerted to assign someone else.
router.post('/bookings/:id/decline', validate({
    params: idParams,
    body: z.object({ reason: v.trimmed(3, 200, 'Reason') }),
}), asyncHandler(async (req, res) => {
    const booking = await ownAssignment(req.params.id, req.auth.id);
    if (booking.status !== 'confirmed') throw conflict('You can only decline a trip before arriving at the pickup', 'invalid_state');
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, driver: req.auth.id, status: 'confirmed' },
        {
            $unset: { driver: 1, 'assignment.assignedAt': 1, 'assignment.acknowledgedAt': 1 },
            $push: {
                'assignment.declines': { driver: req.auth.id, reason: req.body.reason, at: new Date() },
                timeline: { status: 'confirmed', by: 'driver', note: `Driver declined: ${req.body.reason}` },
            },
        },
        { new: true },
    );
    if (!updated) throw conflict('This trip was just updated. Please refresh.', 'stale');
    await rentals.release('driver', req.auth.id, booking._id);
    const driver = await Driver.findById(req.auth.id).select('fullName').lean();
    await notifyOperations(updated, `${booking.reference}: driver needed`, `${driver?.fullName || 'The driver'} declined (${req.body.reason}). Pickup ${rentals.formatDateTime(booking.start)}.`);
    broadcastBooking(updated);
    await audit(req, 'booking.decline', 'booking', updated._id, { reason: req.body.reason });
    res.json({ ok: true });
}));

const issueLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, keyGenerator: req => `issue:${req.auth.id}` });
const ISSUE_LABELS = { breakdown: 'Vehicle breakdown', accident: 'Accident', customer: 'Customer issue', route: 'Route or traffic problem', other: 'Other issue' };

// Breakdowns and accidents are raised as urgent so operations can send a replacement.
router.post('/bookings/:id/issue', issueLimiter, validate({
    params: idParams,
    body: z.object({
        category: z.enum(Object.keys(ISSUE_LABELS)),
        message: v.trimmed(5, 1000, 'Description'),
    }),
}), asyncHandler(async (req, res) => {
    const booking = await ownAssignment(req.params.id, req.auth.id);
    const driver = await Driver.findById(req.auth.id).select('fullName email phoneNumber').lean();
    const ticket = await SupportTicket.create({
        requester: req.auth.id,
        requesterRole: 'driver',
        requesterName: driver?.fullName,
        requesterEmail: driver?.email,
        booking: booking._id,
        subject: `${booking.reference || 'Trip'}: ${ISSUE_LABELS[req.body.category]}`,
        message: `${req.body.message}\n\nDriver phone: ${driver?.phoneNumber}`,
        source: 'trip_issue',
        priority: ['breakdown', 'accident'].includes(req.body.category) ? 'urgent' : 'normal',
    });
    await notifyOperations(booking, ticket.subject, req.body.message.slice(0, 200));
    await audit(req, 'booking.issue', 'booking', booking._id, { ticket: ticket._id, category: req.body.category });
    res.status(201).json({ ticketId: ticket._id });
}));

module.exports = router;
