// Signed-in account features: profile, saved places, notifications, support, feedback.
const express = require('express');
const { accountModel, User, CASE_INSENSITIVE } = require('../models/accounts');
const { Booking } = require('../models/Booking');
const { Notification, SupportTicket, Feedback } = require('../models/misc');
const { requireAuth } = require('../middleware/auth');
const { validate, idParams, limiter } = require('../middleware/common');
const { audit } = require('../services/notify');
const { emitToRoom } = require('../services/realtime');
const v = require('../validation');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/http');

const router = express.Router();
const { z } = v;

// ---------- Profile ----------

router.patch('/me', requireAuth(), validate({
    body: z.object({ ...v.profileFields, email: v.email }).partial(),
}), asyncHandler(async (req, res) => {
    const Model = accountModel(req.auth.role);
    if (req.body.email) {
        const taken = await Model.exists({ email: req.body.email, _id: { $ne: req.auth.id } }).collation(CASE_INSENSITIVE);
        if (taken) throw conflict('An account with this email already exists', 'duplicate');
    }
    const account = await Model.findByIdAndUpdate(req.auth.id, { $set: req.body }, { new: true, runValidators: true });
    res.json({ account: { ...account.toJSON(), role: req.auth.role } });
}));

const MAX_SAVED_PLACES = 10;

router.post('/me/places', requireAuth('customer'), validate({
    body: v.place.pick({ lat: true, lng: true }).extend({ label: v.trimmed(1, 30, 'Label'), address: v.trimmed(1, 200, 'Address') }),
}), asyncHandler(async (req, res) => {
    const updated = await User.findOneAndUpdate(
        { _id: req.auth.id, [`savedPlaces.${MAX_SAVED_PLACES - 1}`]: { $exists: false } },
        { $push: { savedPlaces: req.body } },
        { new: true },
    );
    if (!updated) throw badRequest(`You can save up to ${MAX_SAVED_PLACES} places`);
    res.status(201).json({ savedPlaces: updated.savedPlaces });
}));

router.delete('/me/places/:id', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const updated = await User.findByIdAndUpdate(req.auth.id, { $pull: { savedPlaces: { _id: req.params.id } } }, { new: true });
    res.json({ savedPlaces: updated.savedPlaces });
}));

// ---------- Trusted contact (used by SOS) ----------

router.put('/me/trusted-contact', requireAuth('customer'), validate({
    body: z.object({ name: v.trimmed(2, 60, 'Contact name'), phone: v.phone }),
}), asyncHandler(async (req, res) => {
    const me = await User.findById(req.auth.id).select('phoneNumber').lean();
    const digits = value => String(value || '').replace(/\D/g, '').slice(-10);
    if (digits(me?.phoneNumber) === digits(req.body.phone)) throw badRequest('Your trusted contact must be someone else, not your own number');
    const updated = await User.findByIdAndUpdate(req.auth.id, { $set: { trustedContact: req.body } }, { new: true });
    res.json({ trustedContact: updated.trustedContact });
}));

router.delete('/me/trusted-contact', requireAuth('customer'), asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.auth.id }, { $unset: { trustedContact: 1 } });
    res.status(204).end();
}));

// ---------- Notifications ----------

router.get('/notifications', requireAuth(), asyncHandler(async (req, res) => {
    const filter = { recipient: req.auth.id, recipientRole: req.auth.role };
    const [items, unread] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean(),
        Notification.countDocuments({ ...filter, readAt: null }),
    ]);
    res.json({ items, unread });
}));

router.post('/notifications/read-all', requireAuth(), asyncHandler(async (req, res) => {
    await Notification.updateMany({ recipient: req.auth.id, recipientRole: req.auth.role, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
}));

router.post('/notifications/:id/read', requireAuth(), validate({ params: idParams }), asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, recipient: req.auth.id, recipientRole: req.auth.role }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
}));

// ---------- Support tickets ----------

const supportLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, message: 'You have opened several tickets recently. Our team will get back to you soon.' });

async function createTicket(auth, { subject, message, bookingId, source }) {
    if (bookingId) {
        const owns = await Booking.exists({ _id: bookingId, ...(auth.role === 'customer' ? { user: auth.id } : { driver: auth.id }) });
        if (!owns) throw notFound('Booking not found');
    }
    const account = await accountModel(auth.role).findById(auth.id).select('fullName email').lean();
    const ticket = await SupportTicket.create({
        requester: auth.id,
        requesterRole: auth.role,
        requesterName: account?.fullName,
        requesterEmail: account?.email,
        booking: bookingId,
        subject,
        message,
        source,
    });
    emitToRoom('admins', 'support:new', { id: ticket._id.toString() });
    return ticket;
}

router.post('/support', requireAuth('customer', 'driver'), supportLimiter, validate({
    body: z.object({
        subject: v.trimmed(3, 120, 'Subject'),
        message: v.trimmed(10, 2000, 'Message'),
        bookingId: v.z.string().regex(/^[a-f\d]{24}$/i).optional(),
    }),
}), asyncHandler(async (req, res) => {
    const ticket = await createTicket(req.auth, { ...req.body, source: 'form' });
    res.status(201).json({ ticket });
}));

router.get('/support', requireAuth('customer', 'driver'), asyncHandler(async (req, res) => {
    const items = await SupportTicket.find({ requester: req.auth.id, requesterRole: req.auth.role }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ items });
}));

// ---------- App feedback ----------

router.post('/feedback', requireAuth('customer', 'driver'), limiter({ windowMs: 24 * 3600 * 1000, limit: 5 }), validate({
    body: z.object({
        appRating: z.number().int().min(1).max(5),
        additionalComments: z.string().trim().max(1000).optional(),
    }),
}), asyncHandler(async (req, res) => {
    const feedback = await Feedback.create({
        ...req.body,
        userId: req.auth.role === 'customer' ? req.auth.id : undefined,
        driverId: req.auth.role === 'driver' ? req.auth.id : undefined,
    });
    await audit(req, 'feedback.create', 'feedback', feedback._id);
    res.status(201).json({ ok: true });
}));

module.exports = { router, createTicket };
