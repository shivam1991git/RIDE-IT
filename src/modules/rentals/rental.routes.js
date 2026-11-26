// Customer side of chauffeur rentals: options, search with prices, booking
// requests, cancellation terms and rescheduling.
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Booking } = require('../bookings/booking.model');
const Car = require('../fleet/car.model');
const { Admin } = require('../accounts/account.model');
const { requireAuth } = require('../../core/middleware/auth.middleware');
const { validate, limiter, idParams } = require('../../core/middleware/request.middleware');
const rentals = require('./rental.service');
const { loadForViewer } = require('../bookings/booking-viewer.service');
const { notify, broadcastBooking } = require('../notifications/notification.service');
const { audit } = require('../audit/audit.service');
const { emitToRoom } = require('../notifications/realtime.service');
const v = require('../../core/validation');
const { asyncHandler, badRequest, notFound, conflict } = require('../../core/http');

const router = express.Router();
const { z } = v;

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 40, message: 'Too many searches. Please wait a moment.' });
const MAX_PENDING_REQUESTS = 5;

const objectIdString = label => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label}`);
const optionalText = max => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const tripFields = {
    rentalType: z.enum(Object.keys(rentals.RENTAL_TYPE_LABELS), { error: 'Choose a rental type' }),
    packageKey: z.string().max(20).optional(),
    pickup: v.place.optional(),
    drop: v.place.optional(),
    destinationKey: z.string().max(30).optional(),
    airportDirection: z.enum(['to_airport', 'from_airport']).optional(),
    start: v.isoDate('Pickup time'),
    returnAt: v.isoDate('Return time').optional(),
    passengers: z.number({ error: 'Number of passengers is required' }).int().min(1, 'At least 1 passenger').max(12, 'At most 12 passengers'),
};

const searchBody = z.object(tripFields).refine(body => body.pickup || (body.rentalType === 'airport' && body.airportDirection === 'from_airport'), {
    message: 'Pickup address is required',
    path: ['pickup'],
});

const bookBody = z.object({
    ...tripFields,
    carId: objectIdString('car'),
    instructions: optionalText(500),
    paymentMethod: z.enum(['cash', 'upi']).default('cash'),
}).refine(body => body.pickup || (body.rentalType === 'airport' && body.airportDirection === 'from_airport'), {
    message: 'Pickup address is required',
    path: ['pickup'],
});

// ---------- Public catalogue ----------

router.get('/rentals/options', asyncHandler(async (req, res) => {
    const [settings, rates] = await Promise.all([rentals.getSettings(), rentals.activeRates()]);
    const priceOf = kind => rate => Math.min(...rate.packages
        .filter(item => rentals.PACKAGES.find(pkg => pkg.key === item.key)?.kind === kind)
        .map(item => item.price));
    const classes = Object.values(rates).map(rate => ({
        vehicleClass: rate.vehicleClass,
        label: rate.label,
        fromPrice: Math.min(...rate.packages.map(item => item.price)),
        hourlyFrom: priceOf('hourly')(rate),
        fullDayFrom: priceOf('full_day')(rate),
        airportFare: rate.airport.fare,
        perKm: rate.outstation.perKm,
    }));
    res.json({
        types: Object.entries(rentals.RENTAL_TYPE_LABELS).map(([key, label]) => ({ key, label })),
        packages: rentals.PACKAGES.map(pkg => ({ ...pkg, label: rentals.packageLabel(pkg) })),
        destinations: rentals.DESTINATIONS,
        airport: rentals.AIRPORT,
        classes,
        policy: {
            minLeadHours: settings.minLeadHours,
            maxAdvanceDays: settings.maxAdvanceDays,
            gstPercent: settings.gstPercent,
            cancellation: settings.cancellation,
            exclusions: settings.exclusions,
        },
        contact: { upiId: settings.upiId, supportPhone: settings.supportPhone, supportEmail: settings.supportEmail },
    });
}));

/**
 * Plans the trip and prices every car for it. Cars that cannot take the trip
 * are still listed (greyed out) with a customer-friendly reason.
 */
router.post('/rentals/search', searchLimiter, validate({ body: searchBody }), asyncHandler(async (req, res) => {
    const settings = await rentals.getSettings();
    const trip = await rentals.planTrip(req.body, settings);
    const [rates, cars] = await Promise.all([
        rentals.activeRates(),
        Car.find({ active: true }).populate('owner', 'active').lean(),
    ]);
    const priced = cars.filter(car => rates[car.category || 'sedan']);
    const busy = await rentals.busyIds('car', priced.map(car => car._id), trip.start, trip.blockEnd);

    const results = priced.map(car => {
        const fare = rentals.priceTrip(trip, rates[car.category || 'sedan'], settings);
        let reason = null;
        if (car.capacity < trip.passengers) reason = `Seats ${car.capacity}`;
        else if (rentals.vehicleIssue(car, trip.blockEnd)) reason = 'Not available for these dates';
        else if (busy.has(car._id.toString())) reason = 'Already booked at this time';
        const { owner, documents, ...publicCar } = car;
        return { car: publicCar, available: !reason, reason, fare };
    }).sort((a, b) => Number(b.available) - Number(a.available) || a.fare.total - b.fare.total);

    res.json({ trip: publicTrip(trip), cars: results });
}));

function publicTrip(trip) {
    return {
        rentalType: trip.rentalType,
        label: rentals.RENTAL_TYPE_LABELS[trip.rentalType],
        start: trip.start,
        end: trip.end,
        totalHours: trip.totalHours,
        pickup: trip.pickup,
        drop: trip.drop,
        destination: trip.destination,
        distanceKm: trip.distanceKm,
        durationMin: trip.durationMin,
        days: trip.days,
        nights: trip.nights,
        package: trip.package ? { ...trip.package, label: rentals.packageLabel(trip.package) } : undefined,
        passengers: trip.passengers,
    };
}

// ---------- Booking requests ----------

async function notifyOperations(booking, title, body) {
    const admins = await Admin.find({ status: 'active', adminRole: { $in: ['super', 'operations', null] } }).select('_id').lean();
    await Promise.all(admins.map(admin => notify({ recipient: admin._id, role: 'admin', type: 'booking.request', title, body, booking })));
    emitToRoom('admins', 'booking:update', { id: booking._id.toString(), status: booking.status, type: booking.type });
}

router.post('/rentals', requireAuth('customer'), searchLimiter, validate({ body: bookBody }), asyncHandler(async (req, res) => {
    const settings = await rentals.getSettings();
    const trip = await rentals.planTrip(req.body, settings);
    const car = await Car.findOne({ _id: req.body.carId, active: true }).lean();
    if (!car) throw notFound('This car is no longer available');
    const rate = (await rentals.activeRates())[car.category || 'sedan'];
    if (!rate) throw conflict('This car type is not available right now', 'unavailable');
    if (car.capacity < trip.passengers) throw badRequest(`${car.name} seats ${car.capacity}. Choose a bigger car for ${trip.passengers} passengers.`);
    if (rentals.vehicleIssue(car, trip.blockEnd)) throw conflict('This car is not available for these dates. Please choose another car.', 'unavailable');

    // Stops accidental double submissions and overlapping trips.
    const overlap = await Booking.findOne({
        user: req.auth.id,
        type: 'rental',
        status: { $in: rentals.OPEN_STATUSES },
        start: { $lt: trip.end },
        end: { $gt: trip.start },
    }).select('reference').lean();
    if (overlap) throw conflict(`You already have a booking${overlap.reference ? ` (${overlap.reference})` : ''} at this time. Cancel it first or choose another time.`, 'duplicate_booking');
    const pending = await Booking.countDocuments({ user: req.auth.id, type: 'rental', status: 'pending_approval' });
    if (pending >= MAX_PENDING_REQUESTS) throw conflict(`You have ${pending} requests waiting for confirmation. Please wait for them to be confirmed first.`, 'too_many_pending');

    const price = rentals.priceTrip(trip, rate, settings);
    const bookingId = new mongoose.Types.ObjectId();
    if (!(await rentals.reserve('car', car._id, bookingId, trip.start, trip.blockEnd))) {
        throw conflict('Someone just booked this car for part of that time. Please choose another car.', 'slot_taken');
    }

    let booking;
    try {
        booking = await Booking.create({
            _id: bookingId,
            type: 'rental',
            reference: await rentals.nextReference(),
            user: req.auth.id,
            status: 'pending_approval',
            rentalType: trip.rentalType,
            packageKey: trip.package?.key,
            airportDirection: trip.airportDirection,
            car: car._id,
            pickup: trip.pickup,
            drop: trip.drop,
            destination: trip.destination,
            start: trip.start,
            end: trip.end,
            blockEnd: trip.blockEnd,
            totalHours: trip.totalHours,
            distanceKm: trip.distanceKm,
            durationMin: trip.durationMin,
            passengers: trip.passengers,
            instructions: req.body.instructions,
            driverRequired: true,
            rates: price.rates,
            totalAmount: price.total,
            fareBreakdown: price.breakdown,
            payment: { method: req.body.paymentMethod, status: 'unpaid', paid: 0, refunded: 0, due: price.total, refundDue: 0 },
            pin: crypto.randomInt(0, 10000).toString().padStart(4, '0'),
            timeline: [{ status: 'pending_approval', by: 'customer' }],
        });
    } catch (error) {
        await rentals.release('car', car._id, bookingId);
        throw error;
    }

    await notifyOperations(booking, `New request ${booking.reference}`, `${rentals.RENTAL_TYPE_LABELS[booking.rentalType]} · ${car.name} · ${rentals.formatDateTime(booking.start)}`);
    await audit(req, 'booking.create', 'booking', booking._id, { type: 'rental', rentalType: booking.rentalType, car: car._id, total: booking.totalAmount });
    res.status(201).json({ booking: await loadForViewer(booking._id, req.auth) });
}));

async function ownRental(id, auth) {
    const booking = await Booking.findOne({ _id: id, user: auth.id, type: 'rental' }).lean();
    if (!booking) throw notFound('Booking not found');
    return booking;
}

// What cancelling right now would cost, shown before the customer confirms.
router.get('/rentals/:id/cancel-terms', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await ownRental(req.params.id, req.auth);
    if (!['pending_approval', 'pending_driver', 'confirmed'].includes(booking.status)) {
        throw conflict('This booking can no longer be cancelled online. Contact support.', 'too_late');
    }
    res.json({ terms: rentals.cancellationTerms(booking, await rentals.getSettings()) });
}));

/**
 * Moves the pickup time (same duration). Car and driver availability are
 * re-checked atomically; if either is busy nothing changes.
 */
async function reschedule(bookingId, newStart, auth, settings) {
    const booking = await Booking.findById(bookingId).lean();
    if (!booking || booking.type !== 'rental') throw notFound('Booking not found');
    if (auth.role === 'customer' && booking.user.toString() !== auth.id) throw notFound('Booking not found');
    if (!rentals.CHANGEABLE_STATUSES.includes(booking.status)) throw conflict('This trip has already started and cannot be rescheduled', 'invalid_state');
    const now = Date.now();
    const minLead = auth.role === 'customer' ? settings.minLeadHours * rentals.HOUR : 0;
    if (newStart.getTime() < now + minLead) {
        throw badRequest(auth.role === 'customer' ? `New pickup must be at least ${settings.minLeadHours} hours from now` : 'New pickup must be in the future');
    }
    if (newStart.getTime() > now + settings.maxAdvanceDays * 24 * rentals.HOUR) throw badRequest(`You can book up to ${settings.maxAdvanceDays} days ahead`);
    const shift = newStart.getTime() - new Date(booking.start).getTime();
    if (shift === 0) throw badRequest('That is already the pickup time');
    const end = new Date(new Date(booking.end).getTime() + shift);
    const blockEnd = new Date(new Date(booking.blockEnd || booking.end).getTime() + shift);

    const car = await Car.findById(booking.car).lean();
    if (!car || rentals.vehicleIssue(car, blockEnd)) throw conflict('The booked car cannot be used at the new time. Contact support to change the car.', 'unavailable');
    if (!(await rentals.move('car', booking.car, booking._id, newStart, blockEnd))) {
        throw conflict('The car is already booked at the new time. Choose another time.', 'slot_taken');
    }
    if (booking.driver && !(await rentals.move('driver', booking.driver, booking._id, newStart, blockEnd))) {
        await rentals.move('car', booking.car, booking._id, booking.start, booking.blockEnd || booking.end);
        throw conflict('The assigned driver is not free at the new time. Choose another time or ask support to reassign.', 'driver_busy');
    }
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: booking.status, start: booking.start },
        {
            $set: { start: newStart, end, blockEnd },
            $push: { timeline: { status: booking.status, by: auth.role, note: `Rescheduled to ${rentals.formatDateTime(newStart)}` } },
        },
        { new: true },
    );
    if (!updated) {
        await rentals.move('car', booking.car, booking._id, booking.start, booking.blockEnd || booking.end);
        if (booking.driver) await rentals.move('driver', booking.driver, booking._id, booking.start, booking.blockEnd || booking.end);
        throw conflict('This booking was just updated by someone else. Please refresh.', 'stale');
    }
    const body = `New pickup: ${rentals.formatDateTime(newStart)}`;
    if (auth.role !== 'customer') await notify({ recipient: booking.user, role: 'customer', type: 'booking.rescheduled', title: `${booking.reference}: pickup time changed`, body, booking: updated });
    if (booking.driver) await notify({ recipient: booking.driver, role: 'driver', type: 'booking.rescheduled', title: `${booking.reference}: pickup time changed`, body, booking: updated });
    if (auth.role === 'customer') await notifyOperations(updated, `${booking.reference} rescheduled by customer`, body);
    broadcastBooking(updated);
    return updated;
}

router.post('/rentals/:id/reschedule', requireAuth('customer'), validate({
    params: idParams,
    body: z.object({ start: v.isoDate('New pickup time') }),
}), asyncHandler(async (req, res) => {
    const updated = await reschedule(req.params.id, req.body.start, req.auth, await rentals.getSettings());
    await audit(req, 'booking.reschedule', 'booking', updated._id, { start: updated.start });
    res.json({ booking: await loadForViewer(updated._id, req.auth) });
}));

module.exports = { router, reschedule, notifyOperations };
