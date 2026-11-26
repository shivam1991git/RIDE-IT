const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Admin-managed promo codes. Codes are stored upper-case and matched exactly.
const promoSchema = new mongoose.Schema({
    code: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 160, default: '' },
    kind: { type: String, enum: ['percent', 'flat'], required: true },
    // Percent (1-90) or flat rupees, depending on kind.
    value: { type: Number, required: true, min: 1 },
    // Upper bound on the rupee discount for percent codes (0 = no cap).
    maxDiscount: { type: Number, min: 0, default: 0 },
    // Fare (before discount) needed for the code to apply.
    minFare: { type: Number, min: 0, default: 0 },
    // Empty = every ride category.
    categories: { type: [String], default: [] },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    // Total redemptions across all riders (0 = unlimited).
    usageLimit: { type: Number, min: 0, default: 0 },
    perUserLimit: { type: Number, min: 1, max: 20, default: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    // Listed to riders as an offer in the booking screen.
    public: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
}, { timestamps: true });
promoSchema.index({ code: 1 }, { unique: true });

// One document per use. The unique (promo, user, seq) index turns
// "at most N uses per rider" into a database guarantee: two concurrent
// bookings that pick the same free seq cannot both be inserted.
const redemptionSchema = new mongoose.Schema({
    promo: { type: ObjectId, ref: 'promos', required: true },
    user: { type: ObjectId, ref: 'user', required: true },
    seq: { type: Number, required: true, min: 1 },
    booking: { type: ObjectId, ref: 'bookings' },
}, { timestamps: { createdAt: true, updatedAt: false } });
redemptionSchema.index({ promo: 1, user: 1, seq: 1 }, { unique: true });
redemptionSchema.index({ booking: 1 });

module.exports = {
    Promo: mongoose.model('promos', promoSchema),
    PromoRedemption: mongoose.model('promoredemptions', redemptionSchema),
};
