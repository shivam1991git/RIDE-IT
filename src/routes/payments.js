const express = require('express');
const { Booking } = require('../models/Booking');
const { requireAuth } = require('../middleware/auth');
const { validate, idParams } = require('../middleware/common');
const payments = require('../services/payments');
const { notify, broadcastBooking, audit } = require('../services/notify');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/http');

const router = express.Router();

async function markPaid(bookingId, intentId) {
    const booking = await Booking.findOneAndUpdate(
        { _id: bookingId, 'payment.stripePaymentIntentId': intentId, 'payment.status': { $ne: 'paid' } },
        { $set: { 'payment.status': 'paid', 'payment.paidAt': new Date() } },
        { new: true },
    );
    if (booking) {
        await notify({ recipient: booking.user, role: 'customer', type: 'payment.paid', title: 'Payment received', body: `₹${booking.totalAmount} paid by card.`, booking });
        broadcastBooking(booking);
    }
    return booking;
}

router.get('/payments/config', (req, res) => {
    res.json({ cardPayments: payments.cardPaymentsEnabled() });
});

router.post('/payments/bookings/:id/intent', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.auth.id }).select('+payment.stripePaymentIntentId');
    if (!booking) throw notFound('Booking not found');
    if (booking.payment.method !== 'card') throw badRequest('This booking is set to cash payment');
    if (booking.payment.status === 'paid') throw conflict('This booking is already paid', 'already_paid');
    if (['cancelled', 'expired'].includes(booking.status)) throw badRequest('This booking is no longer active');

    // Amount always comes from the stored, server-computed fare.
    const intent = await payments.createIntent(booking);
    booking.payment.stripePaymentIntentId = intent.id;
    await booking.save();
    await audit(req, 'payment.intent_created', 'booking', booking._id, { amount: booking.totalAmount });
    res.json({ clientSecret: intent.client_secret, amount: booking.totalAmount, currency: 'INR' });
}));

// Called after the browser confirms the payment. The status is fetched from
// Stripe itself; nothing the client says about the payment is trusted.
router.post('/payments/bookings/:id/sync', requireAuth('customer'), validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.auth.id }).select('+payment.stripePaymentIntentId');
    if (!booking) throw notFound('Booking not found');
    const intentId = booking.payment.stripePaymentIntentId;
    if (!intentId) throw badRequest('No card payment has been started for this booking');
    if (booking.payment.status === 'paid') return res.json({ status: 'paid' });

    const intent = await payments.retrieveIntent(intentId);
    if (intent.status === 'succeeded' && intent.amount === Math.round(booking.totalAmount * 100)) {
        await markPaid(booking._id, intentId);
        return res.json({ status: 'paid' });
    }
    return res.json({ status: intent.status === 'processing' ? 'processing' : 'pending' });
}));

// Mounted with express.raw() before the JSON parser (see app.js).
async function webhookHandler(req, res, next) {
    try {
        const event = payments.constructWebhookEvent(req.body, req.headers['stripe-signature']);
        const intent = event.data.object;
        const bookingId = intent.metadata?.bookingId;
        if (bookingId && event.type === 'payment_intent.succeeded') {
            const booking = await Booking.findById(bookingId).lean();
            if (booking && intent.amount === Math.round(booking.totalAmount * 100)) {
                await markPaid(bookingId, intent.id);
            }
        }
        if (bookingId && event.type === 'payment_intent.payment_failed') {
            await Booking.updateOne({ _id: bookingId, 'payment.stripePaymentIntentId': intent.id, 'payment.status': 'pending' }, { $set: { 'payment.status': 'failed' } });
        }
        res.json({ received: true });
    } catch (error) {
        if (error.type === 'StripeSignatureVerificationError') {
            return res.status(400).json({ error: { code: 'bad_signature', message: 'Invalid signature' } });
        }
        return next(error);
    }
}

module.exports = { router, webhookHandler };
