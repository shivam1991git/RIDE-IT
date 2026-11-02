const mongoose = require('mongoose');

const RIDE_STATUSES = ['requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired'];
const RENTAL_STATUSES = ['pending_driver', 'confirmed', 'completed', 'cancelled'];
const ALL_STATUSES = [...new Set([...RIDE_STATUSES, ...RENTAL_STATUSES])];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired'];

const placeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 250 },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
}, { _id: false });

const ratingSchema = new mongoose.Schema({
    score: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
}, { _id: false });

const bookingSchema = new mongoose.Schema({
    type: { type: String, enum: ['ride', 'rental'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'driver' },
    status: { type: String, enum: ALL_STATUSES, required: true },

    // Ride fields
    category: { type: String },
    pickup: placeSchema,
    drop: placeSchema,
    distanceKm: Number,
    durationMin: Number,
    routeSource: { type: String, enum: ['osrm', 'estimate'] },
    routeGeometry: { type: [[Number]], default: undefined, select: false },
    // Customer shares this PIN with the driver to start the trip.
    pin: { type: String, select: false },

    // Rental fields (names kept from v1 where they existed)
    car: { type: mongoose.Schema.Types.ObjectId, ref: 'cars' },
    start: Date,
    end: Date,
    totalHours: Number,
    driverRequired: Boolean,

    // Fare is always computed on the server.
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    fareBreakdown: {
        type: [{ label: String, amount: Number, _id: false }],
        default: [],
    },

    payment: {
        method: { type: String, enum: ['cash', 'card'], default: 'cash' },
        status: { type: String, enum: ['pending', 'paid', 'refunded', 'failed'], default: 'pending' },
        stripePaymentIntentId: String,
        paidAt: Date,
    },

    // Partial unique indexes on these flags enforce "one active ride per
    // customer" and "one active job per driver" at the database level.
    activeCustomer: { type: Boolean, default: undefined },
    activeDriver: { type: Boolean, default: undefined },

    timeline: {
        type: [{ status: String, at: { type: Date, default: Date.now }, by: String, _id: false }],
        default: [],
    },
    cancellation: {
        by: String,
        reason: { type: String, maxlength: 300 },
        at: Date,
    },
    ratingByCustomer: ratingSchema,
    ratingByDriver: ratingSchema,

    // v1 leftovers, preserved for old records.
    transactionId: { type: String, select: false },
    bookedTimeSlot: { type: mongoose.Schema.Types.Mixed, select: false },
    driverConfirmed: { type: Boolean, select: false },
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            delete ret.__v;
            delete ret.activeCustomer;
            delete ret.activeDriver;
            if (ret.payment) delete ret.payment.stripePaymentIntentId;
            return ret;
        },
    },
});

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ driver: 1, createdAt: -1 });
bookingSchema.index({ type: 1, status: 1, category: 1, createdAt: 1 });
bookingSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { activeCustomer: true }, name: 'one_active_ride_per_customer' });
bookingSchema.index({ driver: 1 }, { unique: true, partialFilterExpression: { activeDriver: true }, name: 'one_active_job_per_driver' });

const Booking = mongoose.model('bookings', bookingSchema);

module.exports = { Booking, RIDE_STATUSES, RENTAL_STATUSES, ALL_STATUSES, TERMINAL_STATUSES };
