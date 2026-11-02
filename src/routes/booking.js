// Customer booking flows (rides + rentals) and shared booking endpoints.
const express = require('express');
const crypto = require('crypto');
const { Booking, TERMINAL_STATUSES } = require('../models/Booking');
const Car = require('../models/Car');
const { FareConfig } = require('../models/misc');
const { Driver, User, publicRating } = require('../models/accounts');
const { requireAuth } = require('../middleware/auth');
const { validate, limiter, idParams } = require('../middleware/common');
const geo = require('../services/geo');
const fare = require('../services/fare');
const payments = require('../services/payments');
const { transition } = require('../services/bookings');
const { notify, broadcastBooking, audit } = require('../services/notify');
const { emitToRoom, driverPoolRoom } = require('../services/realtime');
const v = require('../validation');
const { haversineKm } = require('../utils/geo');
const { asyncHandler, badRequest, notFound, conflict, paginate } = require('../utils/http');

const router = express.Router();
const { z } = v;

const quoteLimiter = limiter({ windowMs: 60 * 1000, limit: 30, message: 'Too many fare checks. Please wait a moment.' });
const paymentMethod = z.enum(['cash', 'card']).default('cash');

async function priceRoute(pickup, drop) {
    geo.assertInServiceArea(pickup, 'Pickup');
    geo.assertInServiceArea(drop, 'Destination');
    if (haversineKm(pickup, drop) < 0.3) throw badRequest('Pickup and destination are too close together');

    const route = await geo.getRoute(pickup, drop);
    const categories = await fare.activeCategories();
    const options = categories.map(category => ({
        category: category.key,
        name: category.name,
        description: category.description,
        capacity: category.capacity,
        ...fare.computeRideFare(category, route.distanceKm, route.durationMin),
    }));
    return { route, options };
}

// ---------- Rides ----------

router.post('/rides/quote', quoteLimiter, validate({ body: z.object({ pickup: v.place, drop: v.place }) }), asyncHandler(async (req, res) => {
    const { route, options } = await priceRoute(req.body.pickup, req.body.drop);
    res.json({
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        routeSource: route.source,
        geometry: route.geometry,
        options: options.map(({ breakdown, ...option }) => ({ ...option, breakdown })),
        currency: 'INR',
    });
}));

router.post('/rides', requireAuth('customer'), quoteLimiter, validate({
    body: z.object({ pickup: v.place, drop: v.place, category: z.string().min(1).max(20), paymentMethod }),
}), asyncHandler(async (req, res) => {
    const { pickup, drop, category } = req.body;
    if (req.body.paymentMethod === 'card' && !payments.cardPaymentsEnabled()) {
        throw badRequest('Card payments are not available right now. Please choose cash.');
    }
    const categoryConfig = await FareConfig.findOne({ key: category, active: true }).lean();
    if (!categoryConfig) throw badRequest('This ride category is not available');

    // Price is recomputed here; nothing fare-related is accepted from the client.
    const { route, options } = await priceRoute(pickup, drop);
    const chosen = options.find(option => option.category === category);

    let booking;
    try {
        booking = await Booking.create({
            type: 'ride',
            user: req.auth.id,
            status: 'requested',
            category,
            pickup,
            drop,
            distanceKm: route.distanceKm,
            durationMin: route.durationMin,
            routeSource: route.source,
            routeGeometry: route.geometry,
            pin: crypto.randomInt(1000, 10000).toString(),
            totalAmount: chosen.total,
            fareBreakdown: chosen.breakdown,
            payment: { method: req.body.paymentMethod },
            activeCustomer: true,
            timeline: [{ status: 'requested', by: 'customer' }],
        });
    } catch (error) {
        if (error.code === 11000) throw conflict('You already have a ride in progress. Finish or cancel it first.', 'already_active');
        throw error;
    }

    emitToRoom(driverPoolRoom(category), 'ride:new', { id: booking._id.toString(), category });
    await audit(req, 'booking.create', 'booking', booking._id, { type: 'ride', category, total: booking.totalAmount });
    res.status(201).json({ booking: await loadForViewer(booking._id, req.auth) });
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
    if (auth.role === 'customer' || auth.role === 'admin') query.select('+pin +routeGeometry');
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
    if (auth.role === 'customer' && !['requested', 'accepted', 'arrived'].includes(booking.status)) delete json.pin;
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
