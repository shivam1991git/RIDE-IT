const mongoose = require('mongoose');

// Self-drive / chauffeured rental fleet (the v1 "cars" collection).
const slotSchema = new mongoose.Schema({
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'bookings', required: true },
    active: { type: Boolean, default: true },
}, { _id: false });

const carSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    image: { type: String, required: true, trim: true, maxlength: 500 },
    capacity: { type: Number, required: true, min: 1, max: 12 },
    fuelType: { type: String, required: true, trim: true, maxlength: 20 },
    rentPerHour: { type: Number, required: true, min: 1, max: 100000 },
    transmission: { type: String, trim: true, maxlength: 20 },
    active: { type: Boolean, default: true },
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

module.exports = mongoose.model('cars', carSchema);
