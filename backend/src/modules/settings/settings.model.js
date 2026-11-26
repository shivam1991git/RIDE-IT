const mongoose = require('mongoose');

// Singleton document (key 'global') holding business rules admins can change.
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    gstPercent: { type: Number, min: 0, max: 28, default: 5 },
    // Turnaround time kept free after every trip for cleaning and travel.
    bufferMinutes: { type: Number, min: 0, max: 360, default: 60 },
    minLeadHours: { type: Number, min: 0, max: 72, default: 2 },
    maxAdvanceDays: { type: Number, min: 1, max: 180, default: 30 },
    cancellation: {
        // Cancelling at least this many hours before pickup is free.
        freeHours: { type: Number, min: 0, max: 168, default: 24 },
        // Between partialHours and freeHours the customer gets partialRefundPercent back.
        partialHours: { type: Number, min: 0, max: 168, default: 6 },
        partialRefundPercent: { type: Number, min: 0, max: 100, default: 50 },
    },
    upiId: { type: String, trim: true, maxlength: 60, default: '' },
    supportPhone: { type: String, trim: true, maxlength: 15, default: '' },
    supportEmail: { type: String, trim: true, maxlength: 120, default: '' },
    exclusions: { type: String, trim: true, maxlength: 400, default: 'Tolls, parking and interstate taxes are paid by the customer at actuals.' },
}, { timestamps: true });

module.exports = { Settings: mongoose.model('settings', settingsSchema) };
