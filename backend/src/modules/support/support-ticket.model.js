const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Help requests from the help centre, the assistant, in-trip SOS and chauffeur trip reports.
const supportTicketSchema = new mongoose.Schema({
    requester: { type: ObjectId, required: true },
    requesterRole: { type: String, enum: ['customer', 'driver'], required: true },
    requesterName: String,
    requesterEmail: String,
    booking: { type: ObjectId, ref: 'bookings' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    source: { type: String, enum: ['form', 'chatbot', 'sos', 'trip_issue'], default: 'form' },
    priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    adminReply: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ requester: 1, createdAt: -1 });

module.exports = { SupportTicket: mongoose.model('supporttickets', supportTicketSchema) };
