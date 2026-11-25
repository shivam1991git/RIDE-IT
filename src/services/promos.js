const { Promo, PromoRedemption } = require('../models/Promo');
const { HttpError, conflict } = require('../utils/http');

const normalise = code => String(code || '').trim().toUpperCase();

const promoError = message => new HttpError(400, message, 'promo_invalid');

function discountFor(promo, fare) {
    const raw = promo.kind === 'percent' ? Math.floor((fare * promo.value) / 100) : promo.value;
    const capped = promo.kind === 'percent' && promo.maxDiscount > 0 ? Math.min(raw, promo.maxDiscount) : raw;
    // Never discount below zero; fares are whole rupees.
    return Math.max(0, Math.min(Math.round(capped), fare));
}

async function usesBy(promoId, userId) {
    return userId ? PromoRedemption.countDocuments({ promo: promoId, user: userId }) : 0;
}

/**
 * Checks a code against one category's fare and returns the discount.
 * Throws a 400 'promo_invalid' error with a rider-friendly message.
 */
async function evaluate(code, { userId, category, fare, now = new Date() }) {
    const promo = await Promo.findOne({ code: normalise(code) }).lean();
    if (!promo || !promo.active) throw promoError('This promo code is not valid');
    if (promo.validFrom && promo.validFrom > now) throw promoError('This promo code is not active yet');
    if (promo.validUntil < now) throw promoError('This promo code has expired');
    if (promo.categories?.length && !promo.categories.includes(category)) {
        throw promoError(`This code only works on ${promo.categories.join(', ')} rides`);
    }
    if (fare < promo.minFare) throw promoError(`Add ₹${Math.ceil(promo.minFare - fare)} more to your fare to use this code (minimum ₹${promo.minFare})`);
    if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) throw promoError('This promo code has been fully redeemed');
    if ((await usesBy(promo._id, userId)) >= promo.perUserLimit) {
        throw promoError(promo.perUserLimit === 1 ? 'You have already used this promo code' : `You can use this code ${promo.perUserLimit} times`);
    }
    return { promo, discount: discountFor(promo, fare) };
}

/**
 * Atomically claims one use of the promo for this booking. Both the global
 * limit ($inc guarded by usedCount < usageLimit) and the per-rider limit
 * (unique seq) hold under concurrent requests.
 */
async function reserve(promo, userId, bookingId) {
    const limitFilter = promo.usageLimit > 0 ? { usedCount: { $lt: promo.usageLimit } } : {};
    const claimed = await Promo.updateOne({ _id: promo._id, active: true, ...limitFilter }, { $inc: { usedCount: 1 } });
    if (!claimed.modifiedCount) throw promoError('This promo code has been fully redeemed');

    const undo = () => Promo.updateOne({ _id: promo._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    const taken = new Set(await PromoRedemption.find({ promo: promo._id, user: userId }).distinct('seq'));
    let seq = 1;
    while (taken.has(seq)) seq += 1;
    if (seq > promo.perUserLimit) {
        await undo();
        throw promoError('You have already used this promo code');
    }
    try {
        await PromoRedemption.create({ promo: promo._id, user: userId, seq, booking: bookingId });
    } catch (error) {
        await undo();
        if (error.code === 11000) throw promoError('You have already used this promo code');
        throw error;
    }
}

// Gives the use back when a booking is cancelled or expires before the trip.
async function release(bookingId) {
    const redemption = await PromoRedemption.findOneAndDelete({ booking: bookingId });
    if (redemption) {
        await Promo.updateOne({ _id: redemption.promo, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    }
    return Boolean(redemption);
}

async function publicOffers(now = new Date()) {
    const promos = await Promo.find({ active: true, public: true, validFrom: { $lte: now }, validUntil: { $gte: now } })
        .sort({ validUntil: 1 })
        .limit(10)
        .lean();
    return promos
        .filter(promo => !(promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit))
        .map(({ code, description, kind, value, maxDiscount, minFare, categories, validUntil }) => ({
            code, description, kind, value, maxDiscount, minFare, categories, validUntil,
        }));
}

function assertUniqueCodeError(error) {
    if (error.code === 11000) throw conflict('A promo with this code already exists', 'duplicate');
    throw error;
}

module.exports = { normalise, discountFor, evaluate, reserve, release, publicOffers, assertUniqueCodeError };
