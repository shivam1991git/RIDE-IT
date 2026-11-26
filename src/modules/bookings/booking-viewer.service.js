// Loads a booking with exactly the fields the current viewer may see
// (customer, assigned driver or admin). Used by every route that returns a booking.
const { config } = require('../../config/env');
const { Booking } = require('./booking.model');
const { Driver, publicRating } = require('../accounts/account.model');
const { notFound } = require('../../core/http');

const CUSTOMER_PUBLIC = 'fullName phoneNumber rating';
const DRIVER_PUBLIC = 'fullName phoneNumber vehicle rating';

async function loadForViewer(id, auth) {
    const query = Booking.findById(id)
        .populate('car', 'name image capacity fuelType category registrationNumber luggage ac rentPerHour')
        .populate('driver', DRIVER_PUBLIC)
        .populate('user', CUSTOMER_PUBLIC);
    if (auth.role === 'customer' || auth.role === 'admin') query.select('+pin +routeGeometry +shareToken');
    else query.select('+routeGeometry');

    const booking = await query;
    if (!booking) throw notFound('Booking not found');
    const userId = booking.user?._id?.toString();
    const driverId = booking.driver?._id?.toString();

    if (auth.role === 'customer' && userId !== auth.id) throw notFound('Booking not found');
    if (auth.role === 'driver' && driverId !== auth.id) {
        // Unassigned open requests are visible to drivers, without customer contact details.
        const driver = await Driver.findById(auth.id).select('status vehicle').lean();
        const openRide = config.ridesEnabled && booking.type === 'ride' && booking.status === 'requested' && driver?.vehicle?.category === booking.category;
        if (!(driver?.status === 'approved' && openRide)) throw notFound('Booking not found');
        const json = booking.toJSON();
        json.user = { fullName: (booking.user?.fullName || 'Customer').split(' ')[0], rating: publicRating(booking.user?.rating) };
        return json;
    }
    const json = booking.toJSON();
    // The customer keeps the PIN only until the trip starts.
    if (auth.role === 'customer' && !['scheduled', 'requested', 'accepted', 'arrived', 'pending_approval', 'confirmed'].includes(booking.status)) delete json.pin;
    // Which drivers declined an assignment is internal to operations.
    if (auth.role !== 'admin' && json.assignment) delete json.assignment.declines;
    if (auth.role === 'customer') {
        json.sharing = Boolean(booking.shareToken);
        if (booking.shareToken) json.shareUrl = `${config.appUrl.replace(/\/$/, '')}/share/${booking.shareToken}`;
    }
    return json;
}

module.exports = { loadForViewer };
