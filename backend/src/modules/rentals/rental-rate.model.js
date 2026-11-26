const mongoose = require('mongoose');
const { VEHICLE_CLASSES } = require('../fleet/car.model');

// Local rental packages: fixed hours + kilometres. Every vehicle class prices
// each package on its own rate card.
const PACKAGES = [
    { key: '4h40', kind: 'hourly', hours: 4, km: 40 },
    { key: '6h60', kind: 'hourly', hours: 6, km: 60 },
    { key: '8h80', kind: 'full_day', hours: 8, km: 80 },
    { key: '12h120', kind: 'full_day', hours: 12, km: 120 },
];

const packageSchema = new mongoose.Schema({
    key: { type: String, required: true, enum: PACKAGES.map(item => item.key) },
    price: { type: Number, required: true, min: 0, max: 100000 },
}, { _id: false });

// One rate card per vehicle class. Bookings store a snapshot of the rates they
// were priced with, so editing a card never changes existing bookings.
const rentalRateSchema = new mongoose.Schema({
    vehicleClass: { type: String, enum: VEHICLE_CLASSES, required: true, unique: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    packages: { type: [packageSchema], default: [] },
    extraKmRate: { type: Number, required: true, min: 0, max: 200 },
    extraHourRate: { type: Number, required: true, min: 0, max: 2000 },
    outstation: {
        perKm: { type: Number, required: true, min: 0, max: 200 },
        minKmPerDay: { type: Number, required: true, min: 0, max: 1000 },
        oneWayMinKm: { type: Number, required: true, min: 0, max: 1000 },
        driverAllowancePerDay: { type: Number, required: true, min: 0, max: 5000 },
        nightCharge: { type: Number, required: true, min: 0, max: 5000 },
    },
    airport: {
        fare: { type: Number, required: true, min: 0, max: 20000 },
        includedKm: { type: Number, required: true, min: 0, max: 200 },
        includedHours: { type: Number, required: true, min: 1, max: 12 },
    },
    active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = { PACKAGES, RentalRate: mongoose.model('rentalrates', rentalRateSchema) };
