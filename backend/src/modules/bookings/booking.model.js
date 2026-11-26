const mongoose = require('mongoose');

// 'scheduled' rides wait until shortly before their pickup time, then enter
// the live 'requested' pool (see dispatchScheduledRides in services/bookings).
const RIDE_STATUSES = ['scheduled', 'requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired'];
// Chauffeur rentals: the customer requests, an admin approves and assigns a car
// and driver, the driver runs the trip. 'pending_driver' is a v2 leftover.
const RENTAL_STATUSES = ['pending_approval', 'confirmed', 'arrived', 'in_progress', 'completed', 'rejected', 'cancelled', 'pending_driver'];
const ALL_STATUSES = [...new Set([...RIDE_STATUSES, ...RENTAL_STATUSES])];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired', 'rejected'];

const RENTAL_TYPES = ['hourly', 'full_day', 'outstation_oneway', 'outstation_round', 'airport'];
const PAYMENT_STATUSES = ['unpaid', 'advance_paid', 'partially_paid', 'paid', 'refund_pending', 'partially_refunded', 'refunded', 'pending', 'failed'];

const placeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 250 },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
}, { _id: false });

// An intermediate stop on a multi-stop ride, with the minutes the driver waits there.
const stopSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 250 },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    waitMin: { type: Number, min: 0, max: 120, default: 0 },
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
    stops: { type: [stopSchema], default: undefined },
    circuit: { type: String, maxlength: 40 },
    scheduledFor: Date,
    preferences: {
        quiet: Boolean,
        ac: Boolean,
        luggage: Boolean,
        assistance: Boolean,
    },
    noteToDriver: { type: String, trim: true, maxlength: 200 },
    distanceKm: Number,
    durationMin: Number,
    routeSource: { type: String, enum: ['osrm', 'estimate'] },
    routeGeometry: { type: [[Number]], default: undefined, select: false },
    // Customer shares this PIN with the driver to start the trip.
    pin: { type: String, select: false },

    // Rental fields (names kept from v1 where they existed)
    car: { type: mongoose.Schema.Types.ObjectId, ref: 'cars' },
    start: Date,
    // Booked end of the trip (return time for round trips).
    end: Date,
    // End of the car/driver reservation: end plus return travel and turnaround buffer.
    blockEnd: Date,
    totalHours: Number,
    driverRequired: Boolean,

    // Human-friendly booking reference, e.g. BK1042.
    reference: { type: String },
    rentalType: { type: String, enum: RENTAL_TYPES },
    packageKey: String,
    airportDirection: { type: String, enum: ['to_airport', 'from_airport'] },
    destination: placeSchema,
    passengers: { type: Number, min: 1, max: 12 },
    instructions: { type: String, trim: true, maxlength: 500 },
    // Rates the booking was priced with; later rate-card edits never change it.
    rates: {
        vehicleClass: String,
        includedKm: Number,
        includedHours: Number,
        extraKmRate: Number,
        extraHourRate: Number,
        gstPercent: Number,
    },
    assignment: {
        assignedAt: Date,
        acknowledgedAt: Date,
        declines: {
            type: [{ driver: mongoose.Schema.Types.ObjectId, reason: String, at: Date, _id: false }],
            default: undefined,
        },
    },
    rejection: {
        reason: { type: String, maxlength: 300 },
        at: Date,
    },
    trip: {
        startOdometer: Number,
        endOdometer: Number,
        startedAt: Date,
        endedAt: Date,
    },
    // Final bill, worked out when the trip completes.
    settlement: {
        actualKm: Number,
        actualHours: Number,
        extraKm: Number,
        extraKmCharge: Number,
        extraHours: Number,
        extraHourCharge: Number,
        tolls: Number,
        parking: Number,
        gst: Number,
        total: Number,
    },
    finalAmount: Number,

    // Fare is always computed on the server.
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    promo: {
        code: String,
        discount: Number,
    },
    fareBreakdown: {
        type: [{ label: String, amount: Number, _id: false }],
        default: [],
    },

    payment: {
        method: { type: String, enum: ['cash', 'card', 'upi'], default: 'cash' },
        status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
        stripePaymentIntentId: String,
        paidAt: Date,
        // Rentals: running totals of the manual payment records (models/rental Payment).
        paid: Number,
        refunded: Number,
        due: Number,
        refundDue: Number,
    },

    // Partial unique indexes on these flags enforce "one active ride per
    // customer" and "one active job per driver" at the database level.
    activeCustomer: { type: Boolean, default: undefined },
    activeDriver: { type: Boolean, default: undefined },

    timeline: {
        type: [{ status: String, at: { type: Date, default: Date.now }, by: String, note: String, _id: false }],
        default: [],
    },
    // Public, revocable token for the read-only live trip page (/share/:token).
    shareToken: { type: String, select: false },
    sosAt: Date,
    cancellation: {
        by: String,
        reason: { type: String, maxlength: 300 },
        at: Date,
        // Rentals: share of the amount paid that is returned, and what is kept.
        refundPercent: Number,
        charge: Number,
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
            delete ret.shareToken;
            return ret;
        },
    },
});

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ driver: 1, createdAt: -1 });
bookingSchema.index({ type: 1, status: 1, category: 1, createdAt: 1 });
bookingSchema.index({ status: 1, scheduledFor: 1 }, { partialFilterExpression: { status: 'scheduled' }, name: 'scheduled_dispatch' });
bookingSchema.index({ reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: 'string' } }, name: 'unique_reference' });
bookingSchema.index({ type: 1, start: 1 });
bookingSchema.index({ shareToken: 1 },{ unique: true, partialFilterExpression: { shareToken: { $type: 'string' } }, name: 'share_token' });
bookingSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { activeCustomer: true }, name: 'one_active_ride_per_customer' });
bookingSchema.index({ driver: 1 }, { unique: true, partialFilterExpression: { activeDriver: true }, name: 'one_active_job_per_driver' });

const Booking = mongoose.model('bookings', bookingSchema);

module.exports = { Booking, RIDE_STATUSES, RENTAL_STATUSES, RENTAL_TYPES, ALL_STATUSES, TERMINAL_STATUSES, PAYMENT_STATUSES };
