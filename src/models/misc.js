const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// One document per ride category; admins can edit prices from the dashboard.
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

const supportTicketSchema = new mongoose.Schema({
    requester: { type: ObjectId, required: true },
    requesterRole: { type: String, enum: ['customer', 'driver'], required: true },
    requesterName: String,
    requesterEmail: String,
    booking: { type: ObjectId, ref: 'bookings' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    source: { type: String, enum: ['form', 'chatbot'], default: 'form' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    adminReply: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ requester: 1, createdAt: -1 });

const auditLogSchema = new mongoose.Schema({
    actor: ObjectId,
    actorRole: String,
    action: { type: String, required: true },
    targetType: String,
    targetId: ObjectId,
    meta: mongoose.Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

// App feedback (v1 collection). Ride ratings live on the booking itself.
const feedbackSchema = new mongoose.Schema({
    appRating: { type: Number, required: true, min: 1, max: 5 },
    carQuality: { type: Number, min: 1, max: 5 },
    driverBehavior: { type: Number, min: 1, max: 5 },
    userBehavior: { type: Number, min: 1, max: 5 },
    additionalComments: { type: String, trim: true, maxlength: 1000 },
    userId: { type: ObjectId, ref: 'user' },
    driverId: { type: ObjectId, ref: 'driver' },
}, { timestamps: true });

module.exports = {
    FareConfig: mongoose.model('fareconfigs', fareConfigSchema),
    Notification: mongoose.model('notifications', notificationSchema),
    SupportTicket: mongoose.model('supporttickets', supportTicketSchema),
    AuditLog: mongoose.model('auditlogs', auditLogSchema),
    Feedback: mongoose.model('feedbacks', feedbackSchema),
};
