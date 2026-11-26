const { AuditLog } = require('./audit-log.model');
const { config } = require('../../config/env');

// Records an important action. Never throws: auditing must not break the request.
async function recordAudit(req, action, targetType, targetId, meta) {
    try {
        await AuditLog.create({
            actor: req?.auth?.id,
            actorRole: req?.auth?.role || 'system',
            action,
            targetType,
            targetId,
            meta,
        });
    } catch (error) {
        if (!config.isTest) console.error('Audit log write failed:', error.message);
    }
}

module.exports = { recordAudit };
