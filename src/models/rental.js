// Collections used by the chauffeur rental business: fleet owners, rate cards,
// manual payment records, platform settings and the booking reference counter.
const mongoose = require('mongoose');
const { VEHICLE_CLASSES } = require('./Car');

const { ObjectId } = mongoose.Schema.Types;

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

// Money in and out of a booking, recorded by an admin or the driver.
// Booking status and payment status are independent; see services/rentals#refreshPayment.
const paymentSchema = new mongoose.Schema({
    booking: { type: ObjectId, ref: 'bookings', required: true },
    kind: { type: String, enum: ['payment', 'refund'], required: true },
    amount: { type: Number, required: true, min: 1, max: 500000 },
    method: { type: String, enum: ['cash', 'upi', 'bank'], required: true },
    // UPI transaction id or bank reference, when there is one.
    reference: { type: String, trim: true, maxlength: 60 },
    note: { type: String, trim: true, maxlength: 200 },
    recordedBy: { id: ObjectId, role: { type: String, enum: ['admin', 'driver'] }, name: String },
}, { timestamps: { createdAt: true, updatedAt: false } });
paymentSchema.index({ booking: 1, createdAt: 1 });
paymentSchema.index({ createdAt: -1 });

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

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

module.exports = {
    PACKAGES,
    FleetOwner:mongoose.model('fleetowners', fleetOwnerSchema),
    RentalRate: mongoose.model('rentalrates', rentalRateSchema),
    Payment: mongoose.model('payments', paymentSchema),
    Settings: mongoose.model('settings', settingsSchema),
    Counter: mongoose.model('counters', counterSchema),
};
