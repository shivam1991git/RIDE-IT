const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Feedback about the app itself (v1 collection). Trip ratings live on the booking.
const feedbackSchema = new mongoose.Schema({
    appRating: { type: Number, required: true, min: 1, max: 5 },
    carQuality: { type: Number, min: 1, max: 5 },
    driverBehavior: { type: Number, min: 1, max: 5 },
    userBehavior: { type: Number, min: 1, max: 5 },
    additionalComments: { type: String, trim: true, maxlength: 1000 },
    userId: { type: ObjectId, ref: 'user' },
    driverId: { type: ObjectId, ref: 'driver' },
}, { timestamps: true });

module.exports = { Feedback: mongoose.model('feedbacks', feedbackSchema) };
