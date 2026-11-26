const { Booking, TERMINAL_STATUSES } = require('./booking.model');
const rentals = require('../rentals/rental.service');
const { notify, broadcastBooking } = require('../notifications/notification.service');
const { audit } = require('../audit/audit.service');
const payments = require('../payments/stripe.service');
const promos = require('../rides/promo.service');
const { HttpError, notFound, forbidden, conflict } = require('../../core/http');

// action -> allowed source statuses, target status, and who may perform it.
const TRANSITIONS = {
    ride: {
        dispatch: { from: ['scheduled'], to: 'requested', actors: ['system'] },
        accept: { from: ['requested'], to: 'accepted', actors: ['driver'] },
        release: { from: ['accepted'], to: 'requested', actors: ['driver'] },
        arrive: { from: ['accepted'], to: 'arrived', actors: ['driver'] },
        start: { from: ['arrived'], to: 'in_progress', actors: ['driver'] },
        complete: { from: ['in_progress'], to: 'completed', actors: ['driver', 'admin'] },
        cancel: { from: ['scheduled', 'requested', 'accepted', 'arrived'], to: 'cancelled', actors: ['customer', 'admin'] },
        expire: { from: ['scheduled', 'requested'], to: 'expired', actors: ['system'] },
    },
    // Chauffeur rentals. 'pending_driver' and completing from 'confirmed' only
    // apply to v2 bookings made before admin approval existed.
    rental: {
        approve: { from: ['pending_approval', 'pending_driver'], to: 'confirmed', actors: ['admin'] },
        reject: { from: ['pending_approval', 'pending_driver'], to: 'rejected', actors: ['admin', 'system'] },
        arrive: { from: ['confirmed'], to: 'arrived', actors: ['driver'] },
        start: { from: ['arrived'], to: 'in_progress', actors: ['driver'] },
        complete: { from: ['in_progress', 'confirmed'], to: 'completed', actors: ['driver', 'admin'] },
        cancel: { from: ['pending_approval', 'pending_driver', 'confirmed', 'arrived', 'in_progress'], to: 'cancelled', actors: ['customer', 'admin'] },
    },
};

const RIDE_REQUEST_TTL_MIN = 10;
// Scheduled rides join the live pool this many minutes before pickup.
const SCHEDULE_DISPATCH_LEAD_MIN = 15;
// A scheduled ride that cannot be dispatched (the rider is still on another
// trip) is retried every sweep until this long after its pickup time.
const SCHEDULE_GRACE_MIN = 15;

const STATUS_MESSAGES = {
    accepted: ['Driver on the way', 'Your driver accepted the ride and is heading to your pickup.'],
    requested: ['Finding another driver', 'Your driver had to drop the ride. We are finding you another one.'],
    arrived: ['Driver has arrived', 'Your driver is at the pickup point. Share your ride PIN to start.'],
    in_progress: ['Trip started', 'Enjoy your ride!'],
    completed: ['Trip completed', 'Thanks for riding with RIDE-IT. Rate your driver to help others.'],
    cancelled: ['Booking cancelled', 'This booking has been cancelled.'],
    expired: ['No drivers available', 'We could not find a driver in time. Please try booking again.'],
    confirmed: ['Rental confirmed', 'Your rental booking is confirmed.'],
};

const RENTAL_MESSAGES = {
    confirmed: ['Booking confirmed', 'Your car and chauffeur are confirmed. Driver details are in your booking.'],
    rejected: ['Booking not confirmed', 'Sorry, we could not confirm this booking.'],
    arrived: ['Your chauffeur has arrived', 'Share your 4-digit PIN with the driver to start the trip.'],
    in_progress: ['Trip started', 'Have a safe journey!'],
    completed: ['Trip completed', 'Thank you for travelling with RIDE-IT. Your final bill is ready.'],
    cancelled: ['Booking cancelled', 'This booking has been cancelled.'],
};

function ownershipFilter(booking, auth, action) {
    if (auth.role === 'admin' || auth.role === 'system') return {};
    if (auth.role === 'customer') {
        if (booking.user.toString() !== auth.id) throw forbidden('This booking belongs to another customer');
        return { user: booking.user };
    }
    if (auth.role === 'driver') {
        if (action === 'accept') return { driver: null };
        if (!booking.driver || booking.driver.toString() !== auth.id) throw forbidden('This booking is assigned to another driver');
        return { driver: booking.driver };
    }
    throw forbidden();
}

/**
 * Applies a lifecycle action atomically. The update is guarded by the status
 * the caller observed, so concurrent actions cannot both succeed.
 */
async function transition(bookingId, action, auth, options = {}) {
    const booking = await Booking.findById(bookingId).select('+pin');
    if (!booking) throw notFound('Booking not found');

    const rule = TRANSITIONS[booking.type]?.[action];
    if (!rule) throw new HttpError(400, `Cannot ${action} a ${booking.type}`, 'invalid_action');
    if (!rule.actors.includes(auth.role)) throw forbidden(`Only ${rule.actors.join(' or ')} can ${action} this booking`);
    if (!rule.from.includes(booking.status)) {
        throw conflict(`Booking is ${booking.status.replace('_', ' ')} and cannot be ${action}ed now`, 'invalid_state');
    }

    const filter = { _id: booking._id, status: booking.status, ...ownershipFilter(booking, auth, action), ...(options.filter || {}) };
    if (options.guard) await options.guard(booking);

    const resolve = value => (typeof value === 'function' ? value(booking) : value) || {};
    const set = { status: rule.to, ...resolve(options.set) };
    const note = typeof options.note === 'function' ? options.note(booking) : options.note;
    const unset = { ...resolve(options.unset) };
    if (TERMINAL_STATUSES.includes(rule.to)) {
        unset.activeCustomer = 1;
        unset.activeDriver = 1;
    }

    let updated;
    try {
        updated = await Booking.findOneAndUpdate(
            filter,
            {
                $set: set,
                ...(Object.keys(unset).length ? { $unset: unset } : {}),
                $push: { timeline: { status: rule.to, by: auth.role, ...(note ? { note } : {}) } },
            },
            { new: true },
        );
    } catch (error) {
        if (error.code === 11000) throw conflict('You already have an active trip', 'already_active');
        throw error;
    }
    if (!updated) throw conflict('This booking was just updated by someone else. Please refresh.', 'stale');

    await afterTransition(updated, action, auth, booking);
    return updated;
}

async function afterTransition(booking, action, auth, previous) {
    if (booking.type === 'rental' && ['cancelled', 'rejected'].includes(booking.status)) {
        await rentals.release('car', booking.car, booking._id);
        await rentals.release('driver', booking.driver, booking._id);
    }
    if (booking.status === 'cancelled' && booking.payment?.status === 'paid' && booking.payment.method === 'card') {
        await payments.refund(booking);
    }
    // Manual (cash/UPI) rentals: refresh what is paid, due or to be refunded.
    if (booking.type === 'rental' && booking.rentalType && ['cancelled', 'rejected', 'completed'].includes(booking.status)) {
        await rentals.refreshPayment(booking._id);
    }

    if (['cancelled', 'expired'].includes(booking.status) && booking.promo?.code) {
        await promos.release(booking._id);
    }

    const messages = booking.type === 'rental' ? { ...STATUS_MESSAGES, ...RENTAL_MESSAGES } : STATUS_MESSAGES;
    let [title, body] = action === 'dispatch'
        ? ['Finding your driver', 'Your scheduled ride is now live. Nearby drivers can see it.']
        : (messages[booking.status] || ['Booking updated', `Status: ${booking.status}`]);
    if (booking.reference) title = `${booking.reference}: ${title}`;
    if (booking.status === 'rejected' && booking.rejection?.reason) body = `${body} Reason: ${booking.rejection.reason}`;
    if (auth.role !== 'customer') {
        await notify({ recipient: booking.user, role: 'customer', type: `booking.${booking.status}`, title, body, booking });
    }
    const driverToTell = booking.driver || (action === 'release' ? previous.driver : null);
    if (driverToTell && auth.role !== 'driver' && booking.status === 'cancelled') {
        await notify({ recipient: driverToTell, role: 'driver', type: 'booking.cancelled', title: 'Trip cancelled', body: 'The customer or an admin cancelled this trip.', booking });
    }
    broadcastBooking(booking);
    await audit(auth.role === 'system' ? null : { auth }, `booking.${action}`, 'booking', booking._id, { from: previous.status, to: booking.status });
}

async function expireStaleRideRequests(maxAgeMin = RIDE_REQUEST_TTL_MIN) {
    const cutoff = new Date(Date.now() - maxAgeMin * 60 * 1000);
    // A dispatched scheduled ride stays open until well after its pickup time.
    const stale = await Booking.find({
        type: 'ride',
        status: 'requested',
        updatedAt: { $lt: cutoff },
        $or: [{ scheduledFor: null }, { scheduledFor: { $lt: cutoff } }],
    }).select('_id').lean();
    let expired = 0;
    for (const { _id } of stale) {
        try {
            await transition(_id, 'expire', { role: 'system' });
            expired += 1;
        } catch (error) {
            // Accepted or cancelled in the meantime; nothing to do.
        }
    }
    return expired;
}

/**
 * Moves scheduled rides whose pickup is near into the live request pool. The
 * dispatch takes the one-active-ride lock; if the rider is still on another
 * trip it is retried next sweep, and expired once the grace period passes.
 */
async function dispatchScheduledRides(now = new Date()) {
    const due = await Booking.find({
        type: 'ride',
        status: 'scheduled',
        scheduledFor: { $lte: new Date(now.getTime() + SCHEDULE_DISPATCH_LEAD_MIN * 60 * 1000) },
    }).select('_id scheduledFor').lean();

    const result = { dispatched: 0, expired: 0, waiting: 0 };
    for (const ride of due) {
        try {
            await transition(ride._id, 'dispatch', { role: 'system' }, { set: { activeCustomer: true } });
            result.dispatched += 1;
        } catch (error) {
            if (error.code !== 'already_active') continue; // cancelled or changed meanwhile
            if (now.getTime() > ride.scheduledFor.getTime() + SCHEDULE_GRACE_MIN * 60 * 1000) {
                try {
                    await transition(ride._id, 'expire', { role: 'system' }, {
                        set: { cancellation: { by: 'system', reason: 'You were on another trip at the scheduled pickup time', at: now } },
                    });
                    result.expired += 1;
                } catch (expireError) {
                    // Cancelled by the rider in the meantime.
                }
            } else {
                result.waiting += 1;
            }
        }
    }
    return result;
}

/**
 * Rental requests that nobody approved before the pickup time are closed, so
 * the car is released and the customer is told instead of waiting forever.
 */
async function rejectUnconfirmedRentals(now = new Date()) {
    const stale = await Booking.find({ type: 'rental', status: { $in: ['pending_approval', 'pending_driver'] }, start: { $lte: now } }).select('_id').lean();
    let rejected = 0;
    for (const { _id } of stale) {
        try {
            await transition(_id, 'reject', { role: 'system' }, {
                set: { rejection: { reason: 'We could not confirm this booking before the pickup time', at: now } },
            });
            rejected += 1;
        } catch (error) {
            // Approved or cancelled in the meantime.
        }
    }
    return rejected;
}

module.exports = {
    rejectUnconfirmedRentals,
    TRANSITIONS,
    RIDE_REQUEST_TTL_MIN,
    SCHEDULE_DISPATCH_LEAD_MIN,
    SCHEDULE_GRACE_MIN,
    transition,
    expireStaleRideRequests,
    dispatchScheduledRides,
};
