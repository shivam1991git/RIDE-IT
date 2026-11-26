// Instant city rides (switched off for Phase 1 unless RIDES_ENABLED=true):
// quotes, booking, multi-stop and circuits, promo offers and live trip sharing.
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { config } = require('../../config/env');
const { Booking, TERMINAL_STATUSES } = require('../bookings/booking.model');
const { FareConfig } = require('./fare-config.model');
const { publicRating } = require('../accounts/account.model');
const { requireAuth, optionalAuth } = require('../../core/middleware/auth.middleware');
const { validate, limiter, idParams } = require('../../core/middleware/request.middleware');
const promos = require('./promo.service');
const fare = require('./fare.service');
const { CIRCUITS, circuitKeys } = require('./circuits');
const { SHAREABLE, SHARE_LINK_GRACE_MS, shareUrl, ensureShareToken } = require('./trip-sharing.service');
const geo = require('../geo/geo.service');
const payments = require('../payments/stripe.service');
const { getBookingForViewer } = require('../bookings/booking-viewer.service');
const { recordAudit } = require('../audit/audit.service');
const { emitToRoom, driverPoolRoom } = require('../notifications/realtime.service');
const v = require('../../core/validation');
const { haversineKm } = require('../../core/geo-math');
const { HttpError, asyncHandler, badRequest, notFound, conflict } = require('../../core/http');

const router = express.Router();
const { z } = v;

// The driver's position is shared on a trip link only while they are on the way or driving.
const DRIVER_ON_TRIP_STATUSES = ['accepted', 'arrived', 'in_progress'];

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

// Instant rides are switched off for the chauffeur-rental launch (RIDES_ENABLED).
const ridesOnly = (req, res, next) => (config.ridesEnabled
    ? next()
    : next(notFound('Instant rides are not available yet. Book a chauffeur-driven car instead.')));

router.get('/circuits', ridesOnly, (req, res) => res.json({ circuits: CIRCUITS }));

router.get('/promos/offers', ridesOnly, asyncHandler(async (req, res) => {
    res.json({ offers: await promos.publicOffers() });
}));

router.post('/rides/quote', ridesOnly, quoteLimiter, optionalAuth, validate({ body: z.object(routeFields) }), asyncHandler(async (req, res) => {
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

router.post('/rides', ridesOnly, requireAuth('customer'), quoteLimiter, validate({ body: rideBody }), asyncHandler(async (req, res) => {
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
    await recordAudit(req, 'booking.create', 'booking', booking._id, {
        type: 'ride', category, total: booking.totalAmount, scheduled: Boolean(scheduledFor), stops: stops.length, promo: promo?.code,
    });
    res.status(201).json({ booking: await getBookingForViewer(booking._id, req.auth) });
}));

// ---------- Live trip sharing ----------

async function findCustomerRide(id, userId) {
    const booking = await Booking.findOne({ _id: id, user: userId }).lean();
    if (!booking) throw notFound('Booking not found');
    if (booking.type !== 'ride') throw badRequest('Only rides can be shared');
    return booking;
}

router.post('/bookings/:id/share', ridesOnly, requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await findCustomerRide(req.params.id, req.auth.id);
    if (!SHAREABLE.includes(booking.status)) throw conflict('This trip has ended, so it can no longer be shared', 'not_shareable');
    const token = await ensureShareToken(booking._id, req.auth.id);
    res.json({ token, url: shareUrl(token) });
}));

router.delete('/bookings/:id/share', ridesOnly, requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    await findCustomerRide(req.params.id, req.auth.id);
    await Booking.updateOne({ _id: req.params.id, user: req.auth.id }, { $unset: { shareToken: 1 } });
    res.status(204).end();
}));

const shareLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

// Public, read-only. Shows enough for a family member to follow the trip,
// never phone numbers, the PIN, payment details or the rider's full name.
router.get('/share/:token', ridesOnly, shareLimiter, validate({
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
                location: live && DRIVER_ON_TRIP_STATUSES.includes(booking.status) ? { lat: driver.lastLocation.lat, lng: driver.lastLocation.lng, at: driver.lastLocation.at } : null,
            } : null,
        });
    }
    res.json({ trip });
}));

router.get('/rides/active', ridesOnly, requireAuth('customer'), asyncHandler(async (req, res) => {
    const active = await Booking.findOne({ user: req.auth.id, type: 'ride', activeCustomer: true }).select('_id').lean();
    res.json({ booking: active ? await getBookingForViewer(active._id, req.auth) : null });
}));

module.exports = { router };
