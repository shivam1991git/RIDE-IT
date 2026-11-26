const { config } = require('../../config/env');
const { HttpError } = require('../../core/http');

let stripeClient = null;

function stripe() {
    if (!config.stripeSecretKey) {
        throw new HttpError(503, 'Card payments are not configured. Please choose cash.', 'payments_unavailable');
    }
    if (config.isProduction && config.stripeSecretKey.startsWith('sk_live_') && process.env.ALLOW_LIVE_PAYMENTS !== 'true') {
        throw new HttpError(503, 'Live payments are disabled for this deployment.', 'payments_unavailable');
    }
    if (!stripeClient) {
        // eslint-disable-next-line global-require
        stripeClient = require('stripe')(config.stripeSecretKey);
    }
    return stripeClient;
}

// Lets tests swap in a fake Stripe client.
function setStripeClient(client) {
    stripeClient = client;
}

const cardPaymentsEnabled = () => Boolean(config.stripeSecretKey);

async function createIntent(booking) {
    const intent = await stripe().paymentIntents.create({
        amount: Math.round(booking.totalAmount * 100),
        currency: 'inr',
        automatic_payment_methods: { enabled: true },
        metadata: { bookingId: booking._id.toString(), type: booking.type },
        description: `RIDE-IT ${booking.type} ${booking._id}`,
    }, { idempotencyKey: `booking-${booking._id}-${booking.totalAmount}` });
    return intent;
}

async function retrieveIntent(id) {
    return stripe().paymentIntents.retrieve(id);
}

function constructWebhookEvent(rawBody, signature) {
    if (!config.stripeWebhookSecret) {
        throw new HttpError(503, 'Webhook secret is not configured', 'payments_unavailable');
    }
    return stripe().webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}

async function refund(booking) {
    const { Booking } = require('../bookings/booking.model'); // eslint-disable-line global-require
    const full = await Booking.findById(booking._id).select('payment');
    const intentId = full?.payment?.stripePaymentIntentId;
    if (!intentId) return;
    try {
        await stripe().refunds.create({ payment_intent: intentId }, { idempotencyKey: `refund-${booking._id}` });
        await Booking.updateOne({ _id: booking._id }, { $set: { 'payment.status': 'refunded' } });
    } catch (error) {
        console.error('Refund failed for booking', booking._id.toString(), error.message);
    }
}

module.exports = {
    cardPaymentsEnabled,
    createIntent,
    retrieveIntent,
    constructWebhookEvent,
    refund,
    setStripeClient,
};
