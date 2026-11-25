// Customer booking flows (rides + rentals) and shared booking endpoints.
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { config } = require('../config');
const { Booking, TERMINAL_STATUSES } = require('../models/Booking');
const Car = require('../models/Car');
const { FareConfig, SupportTicket } = require('../models/misc');
const { Driver, User, publicRating } = require('../models/accounts');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const promos = require('../services/promos');
const { CIRCUITS, circuitKeys } = require('../services/circuits');
const { validate, limiter, idParams } = require('../middleware/common');
const geo = require('../services/geo');
const fare = require('../services/fare');
const payments = require('../services/payments');
const { transition } = require('../services/bookings');
const { notify, broadcastBooking, audit } = require('../services/notify');
const { emitToRoom, driverPoolRoom } = require('../services/realtime');
const v = require('../validation');
const { haversineKm } = require('../utils/geo');
const { HttpError, asyncHandler, badRequest, notFound, conflict, paginate } = require('../utils/http');

const router = express.Router();
const { z } = v;

const quoteLimiter = limiter({ windowMs: 60 * 1000, limit: 30, message: 'Too many fare checks. Please wait a moment.' });
const paymentMethod = z.enum(['cash', 'card']).default('cash');

const MAX_STOPS = 3;
const MIN_LEG_KM = 0.3;
const SCHEDULE_MIN_AHEAD_MIN = 30;
const SCHEDULE_MAX_AHEAD_DAYS = 7;
const MAX_UPCOMING_SCHEDULED = 3;

const stop = v.place.extend({ waitMin: z.number().int().min(0, 'Wait time cannot be negative').max(120, 'Wait at a stop can be at most 120 minutes').default(0) });

const routeFields = {
    pickup: v.place,
    drop: v.place,
    stops: z.array(stop).max(MAX_STOPS, `You can add at most ${MAX_STOPS} stops`).default([]),
    circuit: z.enum(circuitKeys).optional(),
    promoCode: z.string().trim().max(20).optional().or(z.literal('').transform(() => undefined)),
};

const rideBody = z.object({
    ...routeFields,
    category: z.string().min(1).max(20),
    paymentMethod,
    scheduledFor: v.isoDate('Pickup time').optional(),
    preferences: z.object({
        quiet: z.boolean().optional(),
        ac: z.boolean().optional(),
        luggage: z.boolean().optional(),
        assistance: z.boolean().optional(),
    }).optional(),
    noteToDriver: z.string().trim().max(200, 'Note to driver must be at most 200 characters').optional().or(z.literal('').transform(() => undefined)),
});

/**
 * Validates the route (service area, sensible leg lengths) and prices every
 * active category. Stops add driving legs plus waiting time.
 */
async function priceRoute(pickup, drop, stops = []) {
    geo.assertInServiceArea(pickup, 'Pickup');
    stops.forEach((point, index) => geo.assertInServiceArea(point, `Stop ${index + 1}`));
    geo.assertInServiceArea(drop, 'Destination');

    const points = [pickup, ...stops, drop];
    if (!stops.length && haversineKm(pickup, drop) < MIN_LEG_KM) throw badRequest('Pickup and destination are too close together');
    for (let i = 1; i < points.length; i += 1) {
        if (haversineKm(points[i - 1], points[i]) < MIN_LEG_KM) {
            const label = i === points.length - 1 ? 'Destination' : `Stop ${i}`;
            throw badRequest(`${label} is too close to the previous point`);
        }
    }

    const route = stops.length ? await geo.getMultiRoute(points) : await geo.getRoute(pickup, drop);
    const waitMin = stops.reduce((sum, item) => sum + (item.waitMin || 0), 0);
    const categories = await fare.activeCategories();
    const options = categories.map(category => ({
        category: category.key,
        name: category.name,
        description: category.description,
        capacity: category.capacity,
        ...fare.computeRideFare(category, route.distanceKm, route.durationMin, waitMin),
    }));
    return { route, options, waitMin };
}

// Applies a promo to each option. Invalid codes never fail the quote; the
// reason is returned so the rider can see why it did not apply.
async function applyPromoToOptions(options, code, userId) {
    let applied = 0;
    let message = null;
    const priced = [];
    for (const option of options) {
        try {
            const { promo, discount } = await promos.evaluate(code, { userId, category: option.category, fare: option.total });
            priced.push({ ...option, ...fare.applyDiscount(option, promo.code, discount) });
            applied += 1;
        } catch (error) {
            if (error.code !== 'promo_invalid') throw error;
            message = message || error.message;
            priced.push({ ...option, promoError: error.message });
        }
    }
    return { options: priced, promo: { code: promos.normalise(code), valid: applied > 0, message: applied ? null : message } };
}

function checkSchedule(scheduledFor) {
    const now = Date.now();
    if (scheduledFor.getTime() < now + SCHEDULE_MIN_AHEAD_MIN * 60 * 1000) {
        throw badRequest(`Scheduled rides must be at least ${SCHEDULE_MIN_AHEAD_MIN} minutes from now. For sooner, choose "Ride now".`);
    }
    if (scheduledFor.getTime() > now + SCHEDULE_MAX_AHEAD_DAYS * 24 * 3600 * 1000) {
        throw badRequest(`Rides can be scheduled up to ${SCHEDULE_MAX_AHEAD_DAYS} days ahead`);
    }
}

// ---------- Rides ----------

router.get('/circuits', (req, res) => res.json({ circuits: CIRCUITS }));

router.get('/promos/offers', asyncHandler(async (req, res) => {
    res.json({ offers: await promos.publicOffers() });
}));

router.post('/rides/quote', quoteLimiter, optionalAuth, validate({ body: z.object(routeFields) }), asyncHandler(async (req, res) => {
    const { pickup, drop, stops, promoCode } = req.body;
    const priced = await priceRoute(pickup, drop, stops);
    let { options } = priced;
    let promo = null;
    if (promoCode) {
        const userId = req.auth?.role === 'customer' ? req.auth.id : undefined;
        ({ options, promo } = await applyPromoToOptions(options, promoCode, userId));
    }
    res.json({
        distanceKm: priced.route.distanceKm,
        durationMin: priced.route.durationMin,
        waitMin: priced.waitMin,
        routeSource: priced.route.source,
        geometry: priced.route.geometry,
        options,
        promo,
        currency: 'INR',
    });
}));

router.post('/rides', requireAuth('customer'), quoteLimiter, validate({ body: rideBody }), asyncHandler(async (req, res) => {
    const { pickup, drop, stops, category, promoCode, scheduledFor } = req.body;
    if (req.body.paymentMethod === 'card' && !payments.cardPaymentsEnabled()) {
        throw badRequest('Card payments are not available right now. Please choose cash.');
    }
    const categoryConfig = await FareConfig.findOne({ key: category, active: true }).lean();
    if (!categoryConfig) throw badRequest('This ride category is not available');
    if (scheduledFor) {
        checkSchedule(scheduledFor);
        const upcoming = await Booking.countDocuments({ user: req.auth.id, status: 'scheduled' });
        if (upcoming >= MAX_UPCOMING_SCHEDULED) throw badRequest(`You can have at most ${MAX_UPCOMING_SCHEDULED} scheduled rides`);
    }

    // Price is recomputed here; nothing fare-related is accepted from the client.
    const { route, options } = await priceRoute(pickup, drop, stops);
    let chosen = options.find(option => option.category === category);

    // The booking id is generated up front so the promo redemption can point at it.
    const bookingId = new mongoose.Types.ObjectId();
    let promo;
    if (promoCode) {
        const evaluated = await promos.evaluate(promoCode, { userId: req.auth.id, category, fare: chosen.total });
        await promos.reserve(evaluated.promo, req.auth.id, bookingId);
        chosen = fare.applyDiscount(chosen, evaluated.promo.code, evaluated.discount);
        promo = { code: evaluated.promo.code, discount: evaluated.discount };
    }

    const status = scheduledFor ? 'scheduled' : 'requested';
    let booking;
    try {
        booking = await Booking.create({
            _id: bookingId,
            type: 'ride',
            user: req.auth.id,
            status,
            category,
            pickup,
            drop,
            stops: stops.length ? stops : undefined,
            circuit: req.body.circuit,
            scheduledFor,
            preferences: req.body.preferences,
            noteToDriver: req.body.noteToDriver,
            distanceKm: route.distanceKm,
            durationMin: route.durationMin,
            routeSource: route.source,
            routeGeometry: route.geometry,
            pin: crypto.randomInt(1000, 10000).toString(),
            totalAmount: chosen.total,
            fareBreakdown: chosen.breakdown,
            promo,
            payment: { method: req.body.paymentMethod },
            // Scheduled rides take the one-active-ride lock only when dispatched.
            activeCustomer: scheduledFor ? undefined : true,
            timeline: [{ status, by: 'customer' }],
        });
    } catch (error) {
        if (promo) await promos.release(bookingId);
        if (error.code === 11000) throw conflict('You already have a ride in progress. Finish or cancel it first.', 'already_active');
        throw error;
    }

    if (!scheduledFor) emitToRoom(driverPoolRoom(category), 'ride:new', { id: booking._id.toString(), category });
    await audit(req, 'booking.create', 'booking', booking._id, {
        type: 'ride', category, total: booking.totalAmount, scheduled: Boolean(scheduledFor), stops: stops.length, promo: promo?.code,
    });
    res.status(201).json({ booking: await loadForViewer(booking._id, req.auth) });
}));

// ---------- Safety: live trip sharing and SOS ----------

const SHAREABLE = ['scheduled', 'requested', 'accepted', 'arrived', 'in_progress'];
const SOS_STATUSES = ['accepted', 'arrived', 'in_progress'];
const SHARE_LINK_GRACE_MS = 60 * 60 * 1000;
const shareUrl = token => `${config.appUrl.replace(/\/$/, '')}/share/${token}`;

async function ensureShareToken(bookingId, userId) {
    const token = crypto.randomBytes(18).toString('base64url');
    await Booking.updateOne({ _id: bookingId, user: userId, shareToken: null }, { $set: { shareToken: token } });
    const booking = await Booking.findOne({ _id: bookingId, user: userId }).select('+shareToken').lean();
    return booking.shareToken;
}

async function ownRide(id, userId) {
    const booking = await Booking.findOne({ _id: id, user: userId }).lean();
    if (!booking) throw notFound('Booking not found');
    if (booking.type !== 'ride') throw badRequest('Only rides can be shared');
    return booking;
}

router.post('/bookings/:id/share', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await ownRide(req.params.id, req.auth.id);
    if (!SHAREABLE.includes(booking.status)) throw conflict('This trip has ended, so it can no longer be shared', 'not_shareable');
    const token = await ensureShareToken(booking._id, req.auth.id);
    res.json({ token, url: shareUrl(token) });
}));

router.delete('/bookings/:id/share', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    await ownRide(req.params.id, req.auth.id);
    await Booking.updateOne({ _id: req.params.id, user: req.auth.id }, { $unset: { shareToken: 1 } });
    res.status(204).end();
}));

const shareLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

// Public, read-only. Shows enough for a family member to follow the trip,
// never phone numbers, the PIN, payment details or the rider's full name.
router.get('/share/:token', shareLimiter, validate({
    params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,40}$/, 'Invalid link') }),
}), asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ shareToken: req.params.token })
        .select('+routeGeometry')
        .populate('user', 'fullName')
        .populate('driver', 'fullName vehicle rating lastLocation')
        .lean();
    if (!booking) throw notFound('This trip link is not valid or was turned off');

    const ended = TERMINAL_STATUSES.includes(booking.status);
    if (ended && Date.now() - new Date(booking.updatedAt).getTime() > SHARE_LINK_GRACE_MS) {
        throw new HttpError(410, 'This trip has ended and the link has expired', 'expired');
    }
    const firstName = name => (name || '').split(' ')[0] || null;
    const trip = {
        status: booking.status,
        ended,
        riderFirstName: firstName(booking.user?.fullName),
        category: booking.category,
        scheduledFor: booking.scheduledFor,
        updatedAt: booking.updatedAt,
    };
    if (!ended) {
        const driver = booking.driver;
        const live = driver?.lastLocation?.at && Date.now() - new Date(driver.lastLocation.at).getTime() < 5 * 60 * 1000;
        Object.assign(trip, {
            pickup: booking.pickup,
            drop: booking.drop,
            stops: booking.stops || [],
            routeGeometry: booking.routeGeometry,
            distanceKm: booking.distanceKm,
            durationMin: booking.durationMin,
            timeline: (booking.timeline || []).map(({ status, at }) => ({ status, at })),
            driver: driver ? {
                firstName: firstName(driver.fullName),
                rating: publicRating(driver.rating),
                vehicle: {
                    make: driver.vehicle?.make, model: driver.vehicle?.model, color: driver.vehicle?.color, plateNumber: driver.vehicle?.plateNumber,
                },
                location: live && SOS_STATUSES.includes(booking.status) ? { lat: driver.lastLocation.lat, lng: driver.lastLocation.lng, at: driver.lastLocation.at } : null,
            } : null,
        });
    }
    res.json({ trip });
}));

const sosLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 5, keyGenerator: req => `sos:${req.auth.id}`, message: 'SOS already sent. Our team is on it. Call 112 if you are in danger.' });

router.post('/bookings/:id/sos', requireAuth('customer'), sosLimiter, validate({
    params: idParams,
    body: z.object({ location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional() }),
}), asyncHandler(async (req, res) => {
    const booking = await ownRide(req.params.id, req.auth.id);
    if (!SOS_STATUSES.includes(booking.status)) throw conflict('SOS is available while a driver is assigned or the trip is in progress', 'not_active');

    const rider = await User.findById(req.auth.id).select('fullName email phoneNumber trustedContact').lean();
    const token = await ensureShareToken(booking._id, req.auth.id);
    const where = req.body.location ? `Rider location: ${req.body.location.lat.toFixed(5)}, ${req.body.location.lng.toFixed(5)}.` : 'Rider location not shared.';
    const ticket = await SupportTicket.create({
        requester: req.auth.id,
        requesterRole: 'customer',
        requesterName: rider?.fullName,
        requesterEmail: rider?.email,
        booking: booking._id,
        subject: 'SOS: rider needs urgent help',
        message: `Emergency raised during a ${booking.status.replace('_', ' ')} trip. ${where} Rider phone: ${rider?.phoneNumber}. Live trip: ${shareUrl(token)}`,
        source: 'sos',
        priority: 'urgent',
    });
    await Booking.updateOne({ _id: booking._id }, { $set: { sosAt: new Date() } });
    emitToRoom('admins', 'sos', { bookingId: booking._id.toString(), ticketId: ticket._id.toString(), rider: rider?.fullName });
    await audit(req, 'booking.sos', 'booking', booking._id, { ticket: ticket._id, location: req.body.location });
    res.status(201).json({
        emergencyNumber: '112',
        ticketId: ticket._id,
        shareUrl: shareUrl(token),
        trustedContact: rider?.trustedContact?.phone ? rider.trustedContact : null,
    });
}));

router.get('/rides/active', requireAuth('customer'), asyncHandler(async (req, res) => {
    const active = await Booking.findOne({ user: req.auth.id, type: 'ride', activeCustomer: true }).select('_id').lean();
    res.json({ booking: active ? await loadForViewer(active._id, req.auth) : null });
}));

// ---------- Rentals ----------

const rentalBody = z.object({
    carId: v.z.string().regex(/^[a-f\d]{24}$/i, 'Invalid car'),
    start: v.isoDate('Start time'),
    end: v.isoDate('End time'),
    driverRequired: z.boolean().default(false),
});

function checkRentalWindow(start, end) {
    const now = Date.now();
    if (start.getTime() < now - 5 * 60 * 1000) throw badRequest('Start time must be in the future');
    if (start.getTime() > now + fare.RENTAL_MAX_DAYS_AHEAD * 24 * 3600 * 1000) throw badRequest(`Rentals can be booked up to ${fare.RENTAL_MAX_DAYS_AHEAD} days ahead`);
    if (end <= start) throw badRequest('End time must be after start time');
    const hours = fare.rentalHours(start, end);
    if (hours > fare.RENTAL_MAX_HOURS) throw badRequest('Rentals can last at most 7 days');
    return hours;
}

router.post('/rentals/quote', quoteLimiter, validate({ body: rentalBody }), asyncHandler(async (req, res) => {
    const { carId, start, end, driverRequired } = req.body;
    const car = await Car.findOne({ _id: carId, active: true }).lean();
    if (!car) throw notFound('Car not found');
    const hours = checkRentalWindow(start, end);
    const available = !(await Car.exists({ _id: carId, slots: { $elemMatch: { active: true, start: { $lt: end }, end: { $gt: start } } } }));
    res.json({ hours, available, ...fare.computeRentalFare(car.rentPerHour, hours, driverRequired), currency: 'INR' });
}));

router.post('/rentals', requireAuth('customer'), quoteLimiter, validate({
    body: rentalBody.extend({ paymentMethod }),
}), asyncHandler(async (req, res) => {
    const { carId, start, end, driverRequired } = req.body;
    if (req.body.paymentMethod === 'card' && !payments.cardPaymentsEnabled()) {
        throw badRequest('Card payments are not available right now. Please choose cash.');
    }
    const car = await Car.findOne({ _id: carId, active: true }).lean();
    if (!car) throw notFound('Car not found');
    const hours = checkRentalWindow(start, end);
    const price = fare.computeRentalFare(car.rentPerHour, hours, driverRequired);
    const status = driverRequired ? 'pending_driver' : 'confirmed';

    const booking = await Booking.create({
        type: 'rental',
        user: req.auth.id,
        status,
        car: car._id,
        start,
        end,
        totalHours: hours,
        driverRequired,
        totalAmount: price.total,
        fareBreakdown: price.breakdown,
        payment: { method: req.body.paymentMethod },
        timeline: [{ status, by: 'customer' }],
    });

    // Atomic reservation: only succeeds if no active slot overlaps.
    const reserved = await Car.findOneAndUpdate(
        { _id: car._id, active: true, slots: { $not: { $elemMatch: { active: true, start: { $lt: end }, end: { $gt: start } } } } },
        { $push: { slots: { start, end, booking: booking._id, active: true } } },
    );
    if (!reserved) {
        await Booking.deleteOne({ _id: booking._id });
        throw conflict('This car is already booked for part of that time. Pick another slot.', 'slot_taken');
    }

    if (driverRequired) emitToRoom('drivers:rentals', 'rental:new', { id: booking._id.toString() });
    await audit(req, 'booking.create', 'booking', booking._id, { type: 'rental', car: car._id, total: booking.totalAmount });
    res.status(201).json({ booking: await loadForViewer(booking._id, req.auth) });
}));

// ---------- Shared booking views ----------

const CUSTOMER_PUBLIC = 'fullName phoneNumber rating';
const DRIVER_PUBLIC = 'fullName phoneNumber vehicle rating';

// Loads a booking with exactly the fields this viewer may see.
async function loadForViewer(id, auth) {
    const query = Booking.findById(id)
        .populate('car', 'name image capacity fuelType rentPerHour')
        .populate('driver', DRIVER_PUBLIC)
        .populate('user', CUSTOMER_PUBLIC);
    if (auth.role === 'customer' || auth.role === 'admin') query.select('+pin +routeGeometry +shareToken');
    else query.select('+routeGeometry');

    const booking = await query;
    if (!booking) throw notFound('Booking not found');
    const userId = booking.user?._id?.toString();
    const driverId = booking.driver?._id?.toString();

    if (auth.role === 'customer' && userId !== auth.id) throw notFound('Booking not found');
    if (auth.role === 'driver' && driverId !== auth.id) {
        // Unassigned open requests are visible to drivers, without customer contact details.
        const driver = await Driver.findById(auth.id).select('status vehicle').lean();
        const openRide = booking.type === 'ride' && booking.status === 'requested' && driver?.vehicle?.category === booking.category;
        const openRental = booking.type === 'rental' && booking.status === 'pending_driver';
        if (!(driver?.status === 'approved' && (openRide || openRental))) throw notFound('Booking not found');
        const json = booking.toJSON();
        json.user = { fullName: (booking.user?.fullName || 'Customer').split(' ')[0], rating: publicRating(booking.user?.rating) };
        return json;
    }
    const json = booking.toJSON();
    // The customer keeps the PIN only until the trip starts.
    if (auth.role === 'customer' && !['scheduled', 'requested', 'accepted', 'arrived'].includes(booking.status)) delete json.pin;
    if (auth.role === 'customer') {
        json.sharing = Boolean(booking.shareToken);
        if (booking.shareToken) json.shareUrl = `${config.appUrl.replace(/\/$/, '')}/share/${booking.shareToken}`;
    }
    return json;
}

const listQuery = z.object({
    type: z.enum(['ride', 'rental']).optional(),
    status: z.string().max(20).optional(),
    scope: z.enum(['active', 'past', 'all']).default('all'),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
});

router.get('/bookings', requireAuth('customer', 'driver'), validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const { type, status, scope } = req.validQuery;
    const { page, limit, skip } = paginate(req.validQuery);
    const filter = req.auth.role === 'customer' ? { user: req.auth.id } : { driver: req.auth.id };
    if (type) filter.type = type;
    if (status) filter.status = status;
    else if (scope === 'active') filter.status = { $nin: TERMINAL_STATUSES };
    else if (scope === 'past') filter.status = { $in: TERMINAL_STATUSES };

    const [items, total] = await Promise.all([
        Booking.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('car', 'name image')
            .populate('driver', 'fullName vehicle rating')
            .populate('user', 'fullName'),
        Booking.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total });
}));

router.get('/bookings/:id', requireAuth(), validate({ params: idParams }), asyncHandler(async (req, res) => {
    res.json({ booking: await loadForViewer(req.params.id, req.auth) });
}));

router.post('/bookings/:id/cancel', requireAuth('customer', 'admin'), validate({
    params: idParams,
    body: z.object({ reason: z.string().trim().max(300).optional() }),
}), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'cancel', req.auth, {
        guard: async current => {
            if (current.type === 'rental' && req.auth.role === 'customer' && current.start <= new Date()) {
                throw conflict('This rental has already started and can no longer be cancelled online. Contact support.', 'too_late');
            }
        },
        set: { cancellation: { by: req.auth.role, reason: req.body.reason, at: new Date() } },
    });
    res.json({ booking: await loadForViewer(booking._id, req.auth) });
}));

router.post('/bookings/:id/rate', requireAuth('customer', 'driver'), validate({
    params: idParams,
    body: z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }),
}), asyncHandler(async (req, res) => {
    const isCustomer = req.auth.role === 'customer';
    const field = isCustomer ? 'ratingByCustomer' : 'ratingByDriver';
    const filter = {
        _id: req.params.id,
        status: 'completed',
        driver: { $ne: null },
        [field]: { $exists: false },
        ...(isCustomer ? { user: req.auth.id } : { driver: req.auth.id }),
    };
    const booking = await Booking.findOneAndUpdate(filter, { $set: { [field]: { score: req.body.score, comment: req.body.comment, at: new Date() } } }, { new: true });
    if (!booking) {
        const exists = await Booking.findOne({ _id: req.params.id, ...(isCustomer ? { user: req.auth.id } : { driver: req.auth.id }) }).lean();
        if (!exists) throw notFound('Booking not found');
        throw conflict('You can rate a completed trip with a driver once', 'cannot_rate');
    }
    const target = isCustomer ? Driver : User;
    await target.updateOne({ _id: isCustomer ? booking.driver : booking.user }, { $inc: { 'rating.total': req.body.score, 'rating.count': 1 } });
    if (isCustomer) {
        await notify({ recipient: booking.driver, role: 'driver', type: 'rating.received', title: `You received ${req.body.score}★`, body: req.body.comment || 'A rider rated your trip.', booking });
    }
    broadcastBooking(booking);
    res.json({ booking: await loadForViewer(booking._id, req.auth) });
}));

module.exports = { router, loadForViewer };
