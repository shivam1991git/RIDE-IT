const { Notification } = require('./notification.model');
const { emitTo, emitToRoom } = require('./realtime.service');

// Saves an in-app notification and pushes it to the recipient if they are online.
async function sendNotification({ recipient, role, type, title, body, booking }) {
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
function broadcastBookingUpdate(booking) {
    const payload = { id: booking._id.toString(), status: booking.status, type: booking.type };
    emitTo('customer', booking.user?._id || booking.user, 'booking:update', payload);
    if (booking.driver) emitTo('driver', booking.driver?._id || booking.driver, 'booking:update', payload);
    emitToRoom('admins', 'booking:update', payload);
}

module.exports = { sendNotification, broadcastBookingUpdate };
