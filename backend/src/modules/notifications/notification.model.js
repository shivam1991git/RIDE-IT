const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// In-app notifications (the bell). Deleted automatically after 90 days.
const notificationSchema = new mongoose.Schema({
    recipient: { type: ObjectId, required: true },
    recipientRole: { type: String, enum: ['customer', 'driver', 'admin'], required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 400 },
    booking: { type: ObjectId, ref: 'bookings' },
    readAt: Date,
}, { timestamps: true });
notificationSchema.index({ recipient: 1, recipientRole: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = { Notification: mongoose.model('notifications', notificationSchema) };
