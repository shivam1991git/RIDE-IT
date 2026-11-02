const { Notification, AuditLog } = require('../models/misc');
const { emitTo, emitToRoom } = require('./realtime');
const { config } = require('../config');

async function notify({ recipient, role, type, title, body, booking }) {
    if (!recipient) return;
    const notification = await Notification.create({
        recipient,
        recipientRole: role,
        type,
        title,
        body,
        booking: booking?._id || booking,
    });
    emitTo(role, recipient, 'notification', notification.toJSON());
}

// Lightweight "something changed, refetch" signal for live booking screens.
function broadcastBooking(booking) {
    const payload = { id: booking._id.toString(), status: booking.status, type: booking.type };
    emitTo('customer', booking.user?._id || booking.user, 'booking:update', payload);
    if (booking.driver) emitTo('driver', booking.driver?._id || booking.driver, 'booking:update', payload);
    emitToRoom('admins', 'booking:update', payload);
}

async function audit(req, action, targetType, targetId, meta) {
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
        // Auditing must never break the request that triggered it.
        if (!config.isTest) console.error('Audit log write failed:', error.message);
    }
}

module.exports = { notify, broadcastBooking, audit };
