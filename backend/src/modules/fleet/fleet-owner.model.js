const mongoose = require('mongoose');

// The company itself, or a partner whose cars we operate under an agreement.
const fleetOwnerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['company', 'partner'], default: 'partner' },
    phone: { type: String, trim: true, maxlength: 15 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 200 },
    agreement: {
        reference: { type: String, trim: true, maxlength: 60 },
        startsOn: Date,
        endsOn: Date,
        // Share of each completed trip's fare that goes to the owner.
        commissionPercent: { type: Number, min: 0, max: 100, default: 0 },
        notes: { type: String, trim: true, maxlength: 500 },
    },
    active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = { FleetOwner: mongoose.model('fleetowners', fleetOwnerSchema) };
