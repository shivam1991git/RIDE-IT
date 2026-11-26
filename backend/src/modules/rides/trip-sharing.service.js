// Live trip links for instant rides: a public, revocable token per booking.
const crypto = require('crypto');
const { config } = require('../../config/env');
const { Booking } = require('../bookings/booking.model');

// Trips that can still be shared, and how long a link keeps working after the trip ends.
const SHAREABLE = ['scheduled', 'requested', 'accepted', 'arrived', 'in_progress'];
const SHARE_LINK_GRACE_MS = 60 * 60 * 1000;

const shareUrl = token => `${config.appUrl.replace(/\/$/, '')}/share/${token}`;

async function ensureShareToken(bookingId, userId) {
    const token = crypto.randomBytes(18).toString('base64url');
    await Booking.updateOne({ _id: bookingId, user: userId, shareToken: null }, { $set: { shareToken: token } });
    const booking = await Booking.findOne({ _id: bookingId, user: userId }).select('+shareToken').lean();
    return booking.shareToken;
}

module.exports = { SHAREABLE, SHARE_LINK_GRACE_MS, shareUrl, ensureShareToken };
