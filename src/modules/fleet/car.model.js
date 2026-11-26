const mongoose = require('mongoose');

// Chauffeur-driven fleet (the v1 "cars" collection).
// Vehicle classes drive pricing: every class has its own rate card (see RentalRate).
const VEHICLE_CLASSES = ['hatchback', 'sedan', 'suv', 'muv'];

// Compliance documents. Allocation is blocked when any of these is missing or
// expires before the trip ends (see services/rentals#vehicleIssue).
const DOCUMENT_TYPES = ['rc', 'insurance', 'permit', 'fitness', 'puc'];

const slotSchema = new mongoose.Schema({
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'bookings', required: true },
    active: { type: Boolean, default: true },
}, { _id: false });

const documentSchema = new mongoose.Schema({
    number: { type: String, trim: true, maxlength: 40 },
    expiresOn: Date,
}, { _id: false });

const carSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    image: { type: String, required: true, trim: true, maxlength: 500 },
    category: { type: String, enum: VEHICLE_CLASSES, default: 'sedan' },
    registrationNumber: { type: String, trim: true, uppercase: true, maxlength: 15 },
    capacity: { type: Number, required: true, min: 1, max: 12 },
    luggage: { type: Number, min: 0, max: 10, default: 2 },
    ac: { type: Boolean, default: true },
    fuelType: { type: String, required: true, trim: true, maxlength: 20 },
    transmission: { type: String, trim: true, maxlength: 20 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'fleetowners' },
    documents: {
        rc: documentSchema,
        insurance: documentSchema,
        permit: documentSchema,
        fitness: documentSchema,
        puc: documentSchema,
    },
    // Temporarily off the road (servicing, breakdown). Retired cars use active=false.
    maintenance: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    // v1 hourly self-drive rate; kept so old bookings and records stay readable.
    rentPerHour: { type: Number, min: 0, max: 100000 },
    // Slots double as an atomic reservation lock: a booking is only created
    // when a $push guarded by a non-overlap filter succeeds.
    slots: { type: [slotSchema], default: [], select: false },
    // v1 stored slots as formatted strings; kept untouched until migrated.
    bookedTimeSlot: { type: mongoose.Schema.Types.Mixed, select: false },
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            delete ret.__v;
            delete ret.slots;
            delete ret.bookedTimeSlot;
            return ret;
        },
    },
});

carSchema.index({ registrationNumber: 1 }, { unique: true, partialFilterExpression: { registrationNumber: { $type: 'string' } }, name: 'unique_registration' });

module.exports = mongoose.model('cars', carSchema);
module.exports.VEHICLE_CLASSES = VEHICLE_CLASSES;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
