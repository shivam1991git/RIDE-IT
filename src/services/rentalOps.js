// Operations on chauffeur bookings shared by the admin console and the driver
// app: approval, assignment, car changes, payments and completion. Every step
// re-checks compliance and availability on the server, using atomic locks.
const { Booking } = require('../models/Booking');
const Car = require('../models/Car');
const { Driver, publicRating } = require('../models/accounts');
const { Payment } = require('../models/rental');
const rentals = require('./rentals');
const { transition } = require('./bookings');
const { notify, broadcastBooking } = require('./notify');
const { badRequest, notFound, conflict } = require('../utils/http');

async function loadRental(id) {
    const booking = await Booking.findById(id).lean();
    if (!booking || booking.type !== 'rental') throw notFound('Booking not found');
    return booking;
}

const windowOf = booking => ({ start: new Date(booking.start), end: new Date(booking.blockEnd || booking.end) });

async function checkedDriver(driverId, booking) {
    const driver = await Driver.findById(driverId).lean();
    if (!driver) throw notFound('Driver not found');
    const issue = rentals.driverIssue(driver, windowOf(booking).end);
    if (issue) throw conflict(`${driver.fullName} cannot be assigned: ${issue}`, 'driver_not_compliant');
    return driver;
}

async function reserveDriver(driver, booking) {
    const { start, end } = windowOf(booking);
    if (!(await rentals.reserve('driver', driver._id, booking._id, start, end))) {
        throw conflict(`${driver.fullName} already has a trip during this time`, 'driver_busy');
    }
}

/**
 * Lists cars and drivers for a booking with whether each one can take it, so
 * the admin only picks from options the server will accept.
 */
async function candidates(id) {
    const booking = await loadRental(id);
    const { start, end } = windowOf(booking);
    const [cars, drivers] = await Promise.all([
        Car.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
        Driver.find({ status: 'approved' }).sort({ fullName: 1 }).lean(),
    ]);
    const [busyCars, busyDrivers] = await Promise.all([
        rentals.busyIds('car', cars.map(car => car._id), start, end, booking._id),
        rentals.busyIds('driver', drivers.map(driver => driver._id), start, end, booking._id),
    ]);
    const carRows = cars.map(car => {
        let issue = rentals.vehicleIssue(car, end);
        if (!issue && car.capacity < (booking.passengers || 1)) issue = `Seats only ${car.capacity}`;
        if (!issue && busyCars.has(car._id.toString())) issue = 'Booked at this time';
        const { documents, ...rest } = car;
        return { ...rest, current: car._id.equals(booking.car), available: !issue, issue };
    });
    const driverRows = drivers.map(driver => {
        let issue = rentals.driverIssue(driver, end);
        if (!issue && busyDrivers.has(driver._id.toString())) issue = 'Has another trip at this time';
        const declined = (booking.assignment?.declines || []).some(item => item.driver?.equals(driver._id));
        return {
            _id: driver._id,
            fullName: driver.fullName,
            phoneNumber: driver.phoneNumber,
            rating: publicRating(driver.rating),
            licenseExpiry: driver.licenseExpiry,
            current: Boolean(booking.driver?.equals(driver._id)),
            declined,
            available: !issue,
            issue,
        };
    });
    return { cars: carRows, drivers: driverRows };
}

/**
 * Approves a request: re-checks the car, reserves the chosen driver and
 * confirms the booking in one guarded step. Rolls the driver lock back if the
 * booking changed in the meantime.
 */
async function approve(id, auth, { driverId, carId }) {
    let booking = await loadRental(id);
    if (!['pending_approval', 'pending_driver'].includes(booking.status)) throw conflict(`This booking is already ${booking.status.replace('_', ' ')}`, 'invalid_state');
    if (new Date(booking.start) <= new Date()) throw conflict('The pickup time has passed. Reschedule the booking before approving it.', 'too_late');
    if (carId && !booking.car?.equals(carId)) booking = await changeCar(id, auth, carId);

    const car = await Car.findById(booking.car).lean();
    const carIssue = car ? rentals.vehicleIssue(car, windowOf(booking).end) : 'Car not found';
    if (carIssue) throw conflict(`The booked car cannot be used: ${carIssue}. Change the car first.`, 'car_not_compliant');
    const driver = await checkedDriver(driverId, booking);
    await reserveDriver(driver, booking);
    try {
        const now = new Date();
        const approved = await transition(id, 'approve', auth, {
            filter: { car: booking.car },
            set: { driver: driver._id, 'assignment.assignedAt': now },
            note: `Car ${car.registrationNumber} and driver ${driver.fullName} assigned`,
        });
        await notify({ recipient: driver._id, role: 'driver', type: 'assignment.new', title: `New trip ${approved.reference}`, body: `${rentals.RENTAL_TYPE_LABELS[approved.rentalType]} · pickup ${rentals.formatDateTime(approved.start)} · ${car.name} ${car.registrationNumber}`, booking: approved });
        return approved;
    } catch (error) {
        await rentals.release('driver', driver._id, booking._id);
        throw error;
    }
}

async function reject(id, auth, reason) {
    return transition(id, 'reject', auth, {
        set: { rejection: { reason, at: new Date() } },
        note: reason,
    });
}

// Assigns or replaces the chauffeur before they reach the pickup.
async function assignDriver(id, auth, driverId) {
    const booking = await loadRental(id);
    if (booking.status !== 'confirmed') {
        throw conflict(booking.status === 'pending_approval' ? 'Approve the booking to assign a driver' : 'The driver can only be changed before they reach the pickup', 'invalid_state');
    }
    if (booking.driver?.equals(driverId)) throw badRequest('This driver is already assigned');
    const driver = await checkedDriver(driverId, booking);
    await reserveDriver(driver, booking);
    const previous = booking.driver;
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'confirmed', driver: previous || null },
        {
            $set: { driver: driver._id, 'assignment.assignedAt': new Date() },
            $unset: { 'assignment.acknowledgedAt': 1 },
            $push: { timeline: { status: 'confirmed', by: auth.role, note: `Driver ${previous ? 'changed to' : 'assigned:'} ${driver.fullName}` } },
        },
        { new: true },
    );
    if (!updated) {
        await rentals.release('driver', driver._id, booking._id);
        throw conflict('This booking was just updated by someone else. Please refresh.', 'stale');
    }
    if (previous) {
        await rentals.release('driver', previous, booking._id);
        await notify({ recipient: previous, role: 'driver', type: 'assignment.removed', title: `${booking.reference} reassigned`, body: 'You are no longer assigned to this trip.' });
    }
    await notify({ recipient: driver._id, role: 'driver', type: 'assignment.new', title: `New trip ${booking.reference}`, body: `Pickup ${rentals.formatDateTime(booking.start)}`, booking: updated });
    await notify({ recipient: booking.user, role: 'customer', type: 'booking.driver', title: `${booking.reference}: your chauffeur`, body: `${driver.fullName} will drive you. Contact details are in your booking.`, booking: updated });
    broadcastBooking(updated);
    return updated;
}

// Swaps the car (breakdown, upgrade). The price the customer agreed stays the same.
async function changeCar(id, auth, carId) {
    const booking = await loadRental(id);
    if (!rentals.CHANGEABLE_STATUSES.includes(booking.status)) throw conflict('The car can only be changed before the chauffeur reaches the pickup', 'invalid_state');
    if (booking.car?.equals(carId)) throw badRequest('This car is already assigned');
    const car = await Car.findById(carId).lean();
    if (!car) throw notFound('Car not found');
    const { start, end } = windowOf(booking);
    const issue = rentals.vehicleIssue(car, end) || (car.capacity < (booking.passengers || 1) ? `Seats only ${car.capacity}` : null);
    if (issue) throw conflict(`${car.name} cannot be used: ${issue}`, 'car_not_compliant');
    if (!(await rentals.reserve('car', car._id, booking._id, start, end))) throw conflict(`${car.name} is already booked during this time`, 'slot_taken');

    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: booking.status, car: booking.car },
        { $set: { car: car._id }, $push: { timeline: { status: booking.status, by: auth.role, note: `Car changed to ${car.name} ${car.registrationNumber}` } } },
        { new: true },
    );
    if (!updated) {
        await rentals.release('car', car._id, booking._id);
        throw conflict('This booking was just updated by someone else. Please refresh.', 'stale');
    }
    await rentals.release('car', booking.car, booking._id);
    if (booking.status === 'confirmed') {
        const body = `Your car is now ${car.name} (${car.registrationNumber}). Your fare is unchanged.`;
        await notify({ recipient: booking.user, role: 'customer', type: 'booking.car', title: `${booking.reference}: car changed`, body, booking: updated });
        if (booking.driver) await notify({ recipient: booking.driver, role: 'driver', type: 'booking.car', title: `${booking.reference}: car changed`, body: `Drive ${car.name} ${car.registrationNumber} for this trip.`, booking: updated });
    }
    broadcastBooking(updated);
    return updated;
}

async function recordPayment(id, auth, { kind, amount, method, reference, note }, recorderName) {
    const booking = await loadRental(id);
    if (!booking.rentalType) throw badRequest('Payments for this older booking are managed outside the console');
    const net = (booking.payment?.paid || 0) - (booking.payment?.refunded || 0);
    if (kind === 'refund') {
        if (amount > net) throw badRequest(`You can refund at most ₹${net}, the amount paid so far`);
    } else if (['cancelled', 'rejected'].includes(booking.status)) {
        throw badRequest('This booking is closed. Record a refund instead.');
    }
    await Payment.create({
        booking: booking._id,
        kind,
        amount,
        method,
        reference,
        note,
        recordedBy: { id: auth.id, role: auth.role, name: recorderName },
    });
    const summary = await rentals.refreshPayment(booking._id);
    const title = kind === 'refund' ? `${booking.reference}: refund of ₹${amount}` : `${booking.reference}: payment of ₹${amount} received`;
    await notify({ recipient: booking.user, role: 'customer', type: `payment.${kind}`, title, body: `Paid so far ₹${summary.paid - summary.refunded}. ${summary.balance ? `Balance due ₹${summary.balance}.` : ''}`.trim(), booking });
    broadcastBooking(booking);
    return summary;
}

/**
 * Completes a chauffeur trip: works out the final bill from the distance and
 * actual hours, then records any money collected at drop-off.
 */
async function completeRental(id, auth, body, recorderName) {
    const now = new Date();
    let settlement;
    const booking = await transition(id, 'complete', auth, {
        guard: async current => {
            if (current.status !== 'in_progress') throw conflict('Start the trip before completing it', 'invalid_state');
            const startKm = current.trip?.startOdometer;
            let { actualKm } = body;
            if (actualKm === undefined) {
                if (body.endOdometer === undefined) throw badRequest('Enter the closing odometer reading');
                if (startKm === undefined) throw badRequest('The opening odometer reading is missing. Enter the distance driven instead.');
                if (body.endOdometer < startKm) throw badRequest(`Closing odometer cannot be less than the opening reading (${startKm} km)`);
                actualKm = body.endOdometer - startKm;
            }
            if (actualKm > 5000) throw badRequest('That is more than 5000 km for one trip. Check the odometer reading.');
            settlement = rentals.settle(current, { actualKm, tolls: body.tolls, parking: body.parking }, now);
        },
        set: current => ({
            settlement,
            finalAmount: current.totalAmount + settlement.total,
            'trip.endedAt': now,
            ...(body.endOdometer !== undefined ? { 'trip.endOdometer': body.endOdometer } : {}),
        }),
        note: current => `Final bill ₹${current.totalAmount + settlement.total}`,
    });
    if (body.collected?.amount > 0) {
        await Payment.create({
            booking: booking._id,
            kind: 'payment',
            amount: body.collected.amount,
            method: body.collected.method,
            reference: body.collected.reference,
            note: 'Collected at drop-off',
            recordedBy: { id: auth.id, role: auth.role, name: recorderName },
        });
        await rentals.refreshPayment(booking._id);
    }
    return booking;
}

module.exports = { candidates, approve, reject, assignDriver, changeCar, recordPayment, completeRental };
