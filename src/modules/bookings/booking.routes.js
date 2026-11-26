// Booking endpoints shared by chauffeur rentals and instant rides:
// list, view, cancel (with the rental cancellation policy), rate and SOS.
const express = require('express');
const { config } = require('../../config/env');
const { Booking, TERMINAL_STATUSES } = require('./booking.model');
const { SupportTicket } = require('../support/support-ticket.model');
const { Driver, User } = require('../accounts/account.model');
const { requireAuth } = require('../../core/middleware/auth.middleware');
const { validate, limiter, idParams } = require('../../core/middleware/request.middleware');
const rentals = require('../rentals/rental.service');
const { transition } = require('./booking-lifecycle.service');
const { loadForViewer } = require('./booking-viewer.service');
const { ensureShareToken, shareUrl } = require('../rides/trip-sharing.service');
const { notify, broadcastBooking } = require('../notifications/notification.service');
const { audit } = require('../audit/audit.service');
const { emitToRoom } = require('../notifications/realtime.service');
const v = require('../../core/validation');
const { asyncHandler, badRequest, notFound, conflict, forbidden, paginate } = require('../../core/http');

const router = express.Router();
const { z } = v;

// ---------- SOS ----------

// Instant rides: from driver assignment. Chauffeur trips: once the chauffeur has arrived.
const SOS_STATUSES = ['accepted', 'arrived', 'in_progress'];
const RENTAL_SOS_STATUSES = ['arrived', 'in_progress'];

const sosLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 5, keyGenerator: req => `sos:${req.auth.id}`, message: 'SOS already sent. Our team is on it. Call 112 if you are in danger.' });

router.post('/bookings/:id/sos', requireAuth('customer'), sosLimiter, validate({
    params: idParams,
    body: z.object({ location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional() }),
}), asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.auth.id }).lean();
    if (!booking) throw notFound('Booking not found');
    const isRide = booking.type === 'ride';
    if (!(isRide ? SOS_STATUSES : RENTAL_SOS_STATUSES).includes(booking.status)) {
        throw conflict(isRide ? 'SOS is available while a driver is assigned or the trip is in progress' : 'SOS is available once your chauffeur arrives and during the trip', 'not_active');
    }

    const rider = await User.findById(req.auth.id).select('fullName email phoneNumber trustedContact').lean();
    // Live share links belong to instant rides; chauffeur trips send the booking reference instead.
    const token = isRide && config.ridesEnabled ? await ensureShareToken(booking._id, req.auth.id) : null;
    const where = req.body.location ? `Rider location: ${req.body.location.lat.toFixed(5)}, ${req.body.location.lng.toFixed(5)}.` : 'Rider location not shared.';
    const ticket = await SupportTicket.create({
        requester: req.auth.id,
        requesterRole: 'customer',
        requesterName: rider?.fullName,
        requesterEmail: rider?.email,
        booking: booking._id,
        subject: 'SOS: rider needs urgent help',
        message: `Emergency raised during a ${booking.status.replace('_', ' ')} trip${booking.reference ? ` (${booking.reference})` : ''}. ${where} Rider phone: ${rider?.phoneNumber}.${token ? ` Live trip: ${shareUrl(token)}` : ''}`,
        source: 'sos',
        priority: 'urgent',
    });
    await Booking.updateOne({ _id: booking._id }, { $set: { sosAt: new Date() } });
    emitToRoom('admins', 'sos', { bookingId: booking._id.toString(), ticketId: ticket._id.toString(), rider: rider?.fullName });
    await audit(req, 'booking.sos', 'booking', booking._id, { ticket: ticket._id, location: req.body.location });
    res.status(201).json({
        emergencyNumber: '112',
        ticketId: ticket._id,
        shareUrl: token ? shareUrl(token) : null,
        reference: booking.reference || null,
        trustedContact: rider?.trustedContact?.phone ? rider.trustedContact : null,
    });
}));

// ---------- Viewing, cancelling and rating bookings ----------

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
            .populate('car', 'name image category registrationNumber')
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
    body: z.object({
        reason: z.string().trim().max(300).optional(),
        // Admin only: share of the amount paid to return (default: everything).
        refundPercent: z.number().int().min(0).max(100).optional(),
        // Admin only: explicit confirmation to cancel a trip that is already under way.
        confirmActive: z.boolean().optional(),
    }),
}), asyncHandler(async (req, res) => {
    const isAdmin = req.auth.role === 'admin';
    if (isAdmin && !['super', 'operations'].includes(req.auth.adminRole)) throw forbidden('Your admin role does not allow this action');
    const settings = await rentals.getSettings();
    const booking = await transition(req.params.id, 'cancel', req.auth, {
        guard: async current => {
            if (current.type !== 'rental') return;
            if (isAdmin && (!req.body.reason || req.body.reason.length < 3)) throw badRequest('Give a reason for cancelling; the customer will see it');
            if (!isAdmin) {
                if (!['pending_approval', 'pending_driver', 'confirmed'].includes(current.status) || current.start <= new Date()) {
                    throw conflict('Your trip has already started or your chauffeur has arrived. Contact support to cancel.', 'too_late');
                }
            } else if (['arrived', 'in_progress'].includes(current.status) && !req.body.confirmActive) {
                throw conflict('This trip is under way. Confirm that you really want to cancel an active trip.', 'confirm_required');
            }
        },
        set: current => {
            const cancellation = { by: req.auth.role, reason: req.body.reason, at: new Date() };
            if (current.type === 'rental' && current.rentalType) {
                const terms = rentals.cancellationTerms(current, settings, { refundPercent: isAdmin ? (req.body.refundPercent ?? 100) : undefined });
                Object.assign(cancellation, { refundPercent: terms.refundPercent, charge: terms.charge });
            }
            return { cancellation };
        },
        note: req.body.reason,
    });
    if (booking.type === 'rental' && !isAdmin) {
        const { notifyOperations } = require('../rentals/rental.routes');
        await notifyOperations(booking, `${booking.reference || 'Booking'} cancelled by customer`, req.body.reason || 'No reason given');
    }
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

module.exports = { router };
