const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

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

module.exports = { Payment: mongoose.model('payments', paymentSchema) };
