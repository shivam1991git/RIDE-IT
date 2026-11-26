const mongoose = require('mongoose');

// One document per instant-ride category (auto, mini, sedan, suv); admins edit prices.
const fareConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    capacity: { type: Number, required: true, min: 1 },
    baseFare: { type: Number, required: true, min: 0 },
    perKm: { type: Number, required: true, min: 0 },
    perMin: { type: Number, required: true, min: 0 },
    minFare: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = { FareConfig: mongoose.model('fareconfigs', fareConfigSchema) };
