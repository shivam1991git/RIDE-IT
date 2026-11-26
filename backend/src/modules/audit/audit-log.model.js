const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Who did what, for important actions. Deleted automatically after 180 days.
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

module.exports = { AuditLog: mongoose.model('auditlogs', auditLogSchema) };
