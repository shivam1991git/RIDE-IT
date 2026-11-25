// Business rules for chauffeur-driven rentals: trip planning, pricing,
// availability locks, fleet compliance, cancellation policy and payment status.
const mongoose = require('mongoose');
const { Booking } = require('../models/Booking');
const Car = require('../models/Car');
const { Driver } = require('../models/accounts');
const { PACKAGES, RentalRate, Settings, Payment, Counter } = require('../models/rental');
const geo = require('./geo');
const { haversineKm, round } = require('../utils/geo');
const { badRequest } = require('../utils/http');

const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;
const IST_OFFSET = 5.5 * HOUR;
const MAX_ROUND_TRIP_DAYS = 7;
// Straight-line estimates assume city speeds; intercity roads are faster.
const HIGHWAY_SPEED_KMH = 45;
// From-airport pickups include this much free waiting for delayed flights.
const AIRPORT_WAIT_MIN = 30;
// Statuses in which a booking holds a car (and possibly a driver).
const OPEN_STATUSES = ['pending_approval', 'pending_driver', 'confirmed', 'arrived', 'in_progress'];
// Before the chauffeur reaches the pickup, admins can still change car, driver or time.
const CHANGEABLE_STATUSES = ['pending_approval', 'pending_driver', 'confirmed'];

const AIRPORT = (({ name, address, lat, lng }) => ({ name, address, lat, lng }))(geo.LANDMARKS.find(place => place.tag === 'airport'));

// Popular intercity trips from Varanasi. A fixed list keeps pricing predictable
// and works without any map service.
const DESTINATIONS = [
    { key: 'prayagraj', name: 'Prayagraj (Sangam)', address: 'Prayagraj, Uttar Pradesh', lat: 25.4358, lng: 81.8463 },
    { key: 'vindhyachal', name: 'Vindhyachal Dham', address: 'Mirzapur, Uttar Pradesh', lat: 25.1606, lng: 82.5049 },
    { key: 'ayodhya', name: 'Ayodhya (Ram Mandir)', address: 'Ayodhya, Uttar Pradesh', lat: 26.7956, lng: 82.1943 },
    { key: 'bodh_gaya', name: 'Bodh Gaya', address: 'Gaya, Bihar', lat: 24.6961, lng: 84.9869 },
    { key: 'gorakhpur', name: 'Gorakhpur', address: 'Gorakhpur, Uttar Pradesh', lat: 26.7606, lng: 83.3732 },
    { key: 'kushinagar', name: 'Kushinagar', address: 'Kushinagar, Uttar Pradesh', lat: 26.7400, lng: 83.8880 },
    { key: 'lucknow', name: 'Lucknow', address: 'Lucknow, Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
    { key: 'patna', name: 'Patna', address: 'Patna, Bihar', lat: 25.5941, lng: 85.1376 },
];

const RENTAL_TYPE_LABELS = {
    hourly: 'Hourly local',
    full_day: 'Full day local',
    outstation_oneway: 'Outstation one-way',
    outstation_round: 'Outstation round trip',
    airport: 'Airport transfer',
};

const CLASS_LABELS = { hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', muv: 'MUV (7-seater)' };

// Starting rate cards (INR). Seeded once; super admins edit them afterwards.
const DEFAULT_RATES = [
    { vehicleClass: 'hatchback', prices: [999, 1399, 1799, 2499], extraKmRate: 11, extraHourRate: 120, perKm: 11, airportFare: 799 },
    { vehicleClass: 'sedan', prices: [1199, 1649, 2099, 2899], extraKmRate: 13, extraHourRate: 150, perKm: 13, airportFare: 999 },
    { vehicleClass: 'suv', prices: [1599, 2249, 2799, 3899], extraKmRate: 17, extraHourRate: 200, perKm: 17, airportFare: 1399 },
    { vehicleClass: 'muv', prices: [1899, 2599, 3299, 4499], extraKmRate: 20, extraHourRate: 250, perKm: 20, airportFare: 1599 },
].map(row => ({
    vehicleClass: row.vehicleClass,
    label: CLASS_LABELS[row.vehicleClass],
    packages: PACKAGES.map((pkg, index) => ({ key: pkg.key, price: row.prices[index] })),
    extraKmRate: row.extraKmRate,
    extraHourRate: row.extraHourRate,
    outstation: { perKm: row.perKm, minKmPerDay: 250, oneWayMinKm: 130, driverAllowancePerDay: 300, nightCharge: 250 },
    airport: { fare: row.airportFare, includedKm: 35, includedHours: 2 },
}));

const packageByKey = key => PACKAGES.find(pkg => pkg.key === key);
const packageLabel = pkg => `${pkg.hours} h / ${pkg.km} km`;

async function ensureRentalDefaults() {
    await Promise.all([
        ...DEFAULT_RATES.map(rate => RentalRate.updateOne({ vehicleClass: rate.vehicleClass }, { $setOnInsert: rate }, { upsert: true })),
        Settings.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true }),
    ]);
}

async function getSettings() {
    return Settings.findOneAndUpdate(
        { key: 'global' },
        { $setOnInsert: { key: 'global' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
}

async function activeRates() {
    const rates = await RentalRate.find({ active: true }).lean();
    return Object.fromEntries(rates.map(rate => [rate.vehicleClass, rate]));
}

// ---------- Dates ----------

const formatDate = date => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const formatDateTime = date => new Date(date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Index of the calendar day in India, so outstation days follow local dates.
const istDay = date => Math.floor((new Date(date).getTime() + IST_OFFSET) / (24 * HOUR));

// Calendar days a trip touches (a trip from 6 pm to 2 pm next day is 2 days).
const calendarDays = (start, end) => istDay(end) - istDay(start) + 1;

// Nights the driver is on duty: how many 11 pm (IST) moments fall inside the trip.
function nightsBetween(start, end) {
    const elevenPm = 23 * HOUR - IST_OFFSET;
    const first = Math.ceil((start.getTime() - elevenPm) / (24 * HOUR));
    const last = Math.floor((end.getTime() - elevenPm) / (24 * HOUR));
    return Math.max(0, last - first + 1);
}

// ---------- Trip planning ----------

async function intercityRoute(from, to) {
    const route = await geo.getRoute(from, to);
    if (route.source === 'estimate') {
        route.durationMin = Math.round((route.distanceKm / HIGHWAY_SPEED_KMH) * 60);
    }
    return route;
}

/**
 * Validates what the customer asked for and works out the trip window.
 * `end` is the booked end; `blockEnd` is when the car and driver are free again
 * (one-way trips include the empty drive back, every trip gets a buffer).
 */
async function planTrip(input, settings, now = new Date()) {
    const { rentalType, start } = input;
    if (start.getTime() < now.getTime() + settings.minLeadHours * HOUR) {
        throw badRequest(`Pickup must be at least ${settings.minLeadHours} hours from now so we can confirm your car and driver`);
    }
    if (start.getTime() > now.getTime() + settings.maxAdvanceDays * 24 * HOUR) {
        throw badRequest(`You can book up to ${settings.maxAdvanceDays} days ahead`);
    }
    const buffer = settings.bufferMinutes * MINUTE;
    const trip = { rentalType, start, passengers: input.passengers };

    if (rentalType === 'hourly' || rentalType === 'full_day') {
        const pkg = packageByKey(input.packageKey);
        if (!pkg || pkg.kind !== rentalType) throw badRequest(`Choose a ${rentalType === 'hourly' ? 'hourly' : 'full day'} package`);
        geo.assertInServiceArea(input.pickup, 'Pickup');
        if (input.drop) geo.assertInServiceArea(input.drop, 'Drop');
        Object.assign(trip, {
            package: pkg,
            pickup: input.pickup,
            drop: input.drop || undefined,
            end: new Date(start.getTime() + pkg.hours * HOUR),
        });
    } else if (rentalType === 'airport') {
        if (!['to_airport', 'from_airport'].includes(input.airportDirection)) throw badRequest('Choose pickup from or drop to the airport');
        const place = input.airportDirection === 'to_airport' ? input.pickup : input.drop;
        const label = input.airportDirection === 'to_airport' ? 'Pickup' : 'Drop';
        if (!place) throw badRequest(`${label} address is required`);
        geo.assertInServiceArea(place, label);
        if (haversineKm(place, AIRPORT) < 1) throw badRequest(`${label} is at the airport itself. Choose your home, hotel or another address.`);
        const pickup = input.airportDirection === 'to_airport' ? place : AIRPORT;
        const drop = input.airportDirection === 'to_airport' ? AIRPORT : place;
        const route = await geo.getRoute(pickup, drop);
        const wait = input.airportDirection === 'from_airport' ? AIRPORT_WAIT_MIN : 0;
        Object.assign(trip, {
            airportDirection: input.airportDirection,
            pickup,
            drop,
            distanceKm: round(route.distanceKm, 1),
            durationMin: route.durationMin,
            end: new Date(start.getTime() + (route.durationMin + wait) * MINUTE),
        });
    } else if (rentalType === 'outstation_oneway' || rentalType === 'outstation_round') {
        const destination = DESTINATIONS.find(item => item.key === input.destinationKey);
        if (!destination) throw badRequest('Choose a destination city');
        geo.assertInServiceArea(input.pickup, 'Pickup');
        const { key, ...place } = destination;
        const route = await intercityRoute(input.pickup, place);
        const oneWayMs = route.durationMin * MINUTE;
        let end;
        let returnDrive = 0;
        if (rentalType === 'outstation_oneway') {
            end = new Date(start.getTime() + oneWayMs);
            // The car and driver still have to drive back empty.
            returnDrive = oneWayMs;
        } else {
            if (!input.returnAt) throw badRequest('Return date and time is required for a round trip');
            end = input.returnAt;
            const minimum = start.getTime() + 2 * oneWayMs + HOUR;
            if (end.getTime() < minimum) {
                throw badRequest(`Return must be after ${formatDateTime(minimum)}: the drive takes about ${Math.round(route.durationMin / 60)} h each way`);
            }
            if (calendarDays(start, end) > MAX_ROUND_TRIP_DAYS) throw badRequest(`Round trips can last at most ${MAX_ROUND_TRIP_DAYS} days`);
        }
        Object.assign(trip, {
            pickup: input.pickup,
            destination: place,
            destinationKey: key,
            distanceKm: round(route.distanceKm, 1),
            durationMin: route.durationMin,
            end,
            // Round trips count calendar days; a one-way trip counts the driver's
            // duty time there and back, so a late-evening drop is not two days.
            days: rentalType === 'outstation_round'
                ? calendarDays(start, end)
                : Math.max(1, Math.ceil((2 * oneWayMs) / (24 * HOUR))),
            nights: nightsBetween(start, end),
        });
        trip.blockEnd = new Date(end.getTime() + returnDrive + buffer);
    } else {
        throw badRequest('Choose a rental type');
    }
    trip.blockEnd = trip.blockEnd || new Date(trip.end.getTime() + buffer);
    trip.totalHours = round((trip.end.getTime() - start.getTime()) / HOUR, 1);
    return trip;
}

// ---------- Pricing ----------

const rupees = value => Math.round(value);

/**
 * Prices a planned trip with one vehicle class's rate card. Returns the
 * breakdown shown to the customer and the rates snapshot stored on the booking.
 */
function priceTrip(trip, rate, settings) {
    const lines = [];
    const inclusions = ['Car, fuel and a verified chauffeur'];
    let includedKm = null;
    let includedHours = null;
    let extraHourRate = rate.extraHourRate;
    let extraKmRate = rate.extraKmRate;

    if (trip.rentalType === 'hourly' || trip.rentalType === 'full_day') {
        const price = rate.packages.find(item => item.key === trip.package.key)?.price;
        if (price === undefined) throw badRequest('This package is not available for this car');
        lines.push({ label: `${RENTAL_TYPE_LABELS[trip.rentalType]} package (${packageLabel(trip.package)})`, amount: rupees(price) });
        includedKm = trip.package.km;
        includedHours = trip.package.hours;
    } else if (trip.rentalType === 'airport') {
        const { fare, includedKm: freeKm, includedHours: freeHours } = rate.airport;
        lines.push({ label: `Airport transfer (up to ${freeKm} km)`, amount: rupees(fare) });
        const extraKm = Math.max(0, Math.ceil(trip.distanceKm - freeKm));
        if (extraKm > 0) lines.push({ label: `Extra distance (${extraKm} km × ₹${rate.extraKmRate})`, amount: rupees(extraKm * rate.extraKmRate) });
        includedKm = freeKm + extraKm;
        includedHours = freeHours;
        if (trip.airportDirection === 'from_airport') inclusions.push(`${AIRPORT_WAIT_MIN} min free waiting for your flight`);
    } else {
        const o = rate.outstation;
        const kmCharged = trip.rentalType === 'outstation_oneway'
            ? Math.max(Math.ceil(trip.distanceKm), o.oneWayMinKm)
            : Math.max(Math.ceil(trip.distanceKm * 2), trip.days * o.minKmPerDay);
        const note = trip.rentalType === 'outstation_oneway'
            ? (kmCharged > Math.ceil(trip.distanceKm) ? ` (minimum ${o.oneWayMinKm} km)` : '')
            : (kmCharged > Math.ceil(trip.distanceKm * 2) ? ` (minimum ${o.minKmPerDay} km/day × ${trip.days} days)` : ' (round trip)');
        lines.push({ label: `Distance ${kmCharged} km × ₹${o.perKm}${note}`, amount: rupees(kmCharged * o.perKm) });
        lines.push({ label: `Driver allowance (${trip.days} day${trip.days > 1 ? 's' : ''} × ₹${o.driverAllowancePerDay})`, amount: rupees(trip.days * o.driverAllowancePerDay) });
        if (trip.nights > 0) lines.push({ label: `Night charges (${trip.nights} × ₹${o.nightCharge})`, amount: rupees(trip.nights * o.nightCharge) });
        includedKm = kmCharged;
        extraKmRate = o.perKm;
        extraHourRate = 0;
        inclusions.push('Driver food and stay');
    }

    if (includedKm) inclusions.push(`Up to ${includedKm} km${includedHours ? ` and ${includedHours} h` : ''}`);
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const gst = rupees((subtotal * settings.gstPercent) / 100);
    if (gst > 0) lines.push({ label: `GST (${settings.gstPercent}%)`, amount: gst });

    const extras = [`Extra km ₹${extraKmRate}/km`];
    if (extraHourRate) extras.push(`extra hour ₹${extraHourRate}/h (after 15 min grace)`);
    return {
        total: subtotal + gst,
        breakdown: lines,
        rates: { vehicleClass: rate.vehicleClass, includedKm, includedHours, extraKmRate, extraHourRate, gstPercent: settings.gstPercent },
        inclusions,
        extras: `${extras.join(', ')} + GST`,
        exclusions: settings.exclusions,
    };
}

// ---------- Fleet compliance ----------

const DOCUMENT_LABELS = { rc: 'RC', insurance: 'Insurance', permit: 'Permit', fitness: 'Fitness certificate', puc: 'PUC certificate' };

// Why this car cannot be used until `until`, or null if it can.
function vehicleIssue(car, until) {
    if (car.active === false) return 'This car is retired';
    if (car.maintenance) return 'This car is under maintenance';
    if (!car.registrationNumber) return 'Registration number is missing';
    for (const key of Car.DOCUMENT_TYPES) {
        const doc = car.documents?.[key];
        const label = DOCUMENT_LABELS[key];
        if (!doc?.number) return `${label} details are missing`;
        if (key !== 'rc' && !doc.expiresOn) return `${label} expiry date is missing`;
        if (doc.expiresOn && new Date(doc.expiresOn) < until) return `${label} expires on ${formatDate(doc.expiresOn)}, before this trip ends`;
    }
    return null;
}

function driverIssue(driver, until) {
    if (driver.status !== 'approved') return `Driver is ${driver.status}`;
    if (!driver.licenseExpiry) return 'Driving licence expiry date is missing';
    if (new Date(driver.licenseExpiry) < until) return `Driving licence expires on ${formatDate(driver.licenseExpiry)}, before this trip ends`;
    if (driver.policeVerification?.status !== 'verified') return 'Police verification is not complete';
    return null;
}

// Documents and licences that expire within `days` (or already have).
async function complianceAlerts(days = 30, now = new Date()) {
    const horizon = new Date(now.getTime() + days * 24 * HOUR);
    const [cars, drivers] = await Promise.all([
        Car.find({ active: true }).select('name registrationNumber documents').lean(),
        Driver.find({ status: 'approved' }).select('fullName licenseExpiry policeVerification').lean(),
    ]);
    const alerts = [];
    for (const car of cars) {
        for (const key of Car.DOCUMENT_TYPES) {
            const expiresOn = car.documents?.[key]?.expiresOn;
            if (expiresOn && new Date(expiresOn) <= horizon) {
                alerts.push({ kind: 'car', id: car._id, name: `${car.name} ${car.registrationNumber || ''}`.trim(), item: DOCUMENT_LABELS[key], expiresOn, expired: new Date(expiresOn) < now });
            }
        }
    }
    for (const driver of drivers) {
        if (driver.licenseExpiry && new Date(driver.licenseExpiry) <= horizon) {
            alerts.push({ kind: 'driver', id: driver._id, name: driver.fullName, item: 'Driving licence', expiresOn: driver.licenseExpiry, expired: new Date(driver.licenseExpiry) < now });
        }
        if (driver.policeVerification?.status !== 'verified') {
            alerts.push({ kind: 'driver', id: driver._id, name: driver.fullName, item: 'Police verification pending', expiresOn: null, expired: true });
        }
    }
    return alerts.sort((a, b) => Number(b.expired) - Number(a.expired) || new Date(a.expiresOn || 0) - new Date(b.expiresOn || 0));
}

// ---------- Availability locks (cars and drivers) ----------

// Matches an active slot that overlaps [start, end), optionally ignoring one booking's own slot.
function overlapping(start, end, exceptBooking) {
    return {
        $elemMatch: {
            active: true,
            start: { $lt: end },
            end: { $gt: start },
            ...(exceptBooking ? { booking: { $ne: exceptBooking } } : {}),
        },
    };
}

const LOCKS = {
    car: { model: Car, extra: { active: true, maintenance: { $ne: true } } },
    driver: { model: Driver, extra: { status: 'approved' } },
};

// Atomically reserves [start, end) for a booking; false if anything overlaps.
async function reserve(kind, id, bookingId, start, end) {
    const { model, extra } = LOCKS[kind];
    const result = await model.updateOne(
        { _id: id, ...extra, slots: { $not: overlapping(start, end) } },
        { $push: { slots: { start, end, booking: bookingId, active: true } } },
    );
    return result.modifiedCount === 1;
}

async function release(kind, id, bookingId) {
    if (!id) return;
    await LOCKS[kind].model.updateOne(
        { _id: id },
        { $set: { 'slots.$[slot].active': false } },
        { arrayFilters: [{ 'slot.booking': bookingId, 'slot.active': true }] },
    );
}

// Moves a booking's own reservation to a new window, if nothing else overlaps it.
async function move(kind, id, bookingId, start, end) {
    const { model } = LOCKS[kind];
    const result = await model.updateOne(
        { _id: id, slots: { $not: overlapping(start, end, bookingId) } },
        { $set: { 'slots.$[slot].start': start, 'slots.$[slot].end': end } },
        { arrayFilters: [{ 'slot.booking': bookingId, 'slot.active': true }] },
    );
    return result.matchedCount === 1;
}

// Ids (as strings) of the given cars or drivers that are busy during [start, end).
async function busyIds(kind, ids, start, end, exceptBooking) {
    const busy = await LOCKS[kind].model.find({ _id: { $in: ids }, slots: overlapping(start, end, exceptBooking) }).select('_id').lean();
    return new Set(busy.map(item => item._id.toString()));
}

// ---------- References ----------

async function nextReference() {
    const counter = await Counter.findOneAndUpdate({ _id: 'booking' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    return `BK${1000 + counter.seq}`;
}

// ---------- Cancellation policy ----------

/**
 * What a cancellation costs. The policy decides which share of the fare can be
 * kept; the charge never exceeds what the customer has actually paid, because
 * payments are collected manually.
 */
function cancellationTerms(booking, settings, { refundPercent: override, now = new Date() } = {}) {
    const hoursBefore = (new Date(booking.start).getTime() - now.getTime()) / HOUR;
    const policy = settings.cancellation;
    let refundPercent;
    let rule;
    if (override !== undefined) {
        refundPercent = override;
        rule = 'admin';
    } else if (['pending_approval', 'pending_driver'].includes(booking.status)) {
        refundPercent = 100;
        rule = 'not_confirmed';
    } else if (hoursBefore >= policy.freeHours) {
        refundPercent = 100;
        rule = 'free';
    } else if (hoursBefore >= policy.partialHours) {
        refundPercent = policy.partialRefundPercent;
        rule = 'partial';
    } else {
        refundPercent = 0;
        rule = 'late';
    }
    const paid = Math.max(0, (booking.payment?.paid || 0) - (booking.payment?.refunded || 0));
    const policyCharge = rupees((booking.totalAmount * (100 - refundPercent)) / 100);
    const charge = Math.min(paid, policyCharge);
    return { refundPercent, rule, hoursBefore: round(hoursBefore, 1), paid, policyCharge, charge, refund: paid - charge };
}

// ---------- Payments ----------

/**
 * Payment status is derived from the payment records and the booking status,
 * so it is never edited by hand and always matches the money recorded.
 */
function paymentSummary(booking, paid, refunded) {
    const net = paid - refunded;
    const closed = ['cancelled', 'rejected'].includes(booking.status);
    let due;
    if (booking.status === 'completed') due = booking.finalAmount ?? booking.totalAmount;
    else if (closed) due = booking.cancellation?.charge || 0;
    else due = booking.totalAmount;
    const refundDue = Math.max(0, net - due);

    let status;
    if (closed && paid === 0) status = 'unpaid';
    else if (refundDue > 0) status = refunded > 0 ? 'partially_refunded' : 'refund_pending';
    else if (closed) status = refunded > 0 ? 'refunded' : 'paid';
    else if (net <= 0) status = 'unpaid';
    else if (net >= due) status = 'paid';
    else if (CHANGEABLE_STATUSES.includes(booking.status)) status = 'advance_paid';
    else status = 'partially_paid';

    return { paid, refunded, due, balance: Math.max(0, due - net), refundDue, status };
}

async function refreshPayment(id) {
    const bookingId = new mongoose.Types.ObjectId(String(id));
    const [totals] = await Payment.aggregate([
        { $match: { booking: bookingId } },
        {
            $group: {
                _id: null,
                paid: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
                refunded: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, '$amount', 0] } },
                lastPaidAt: { $max: { $cond: [{ $eq: ['$kind', 'payment'] }, '$createdAt', null] } },
            },
        },
    ]);
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) return null;
    const summary = paymentSummary(booking, totals?.paid || 0, totals?.refunded || 0);
    await Booking.updateOne({ _id: bookingId }, {
        $set: {
            'payment.paid': summary.paid,
            'payment.refunded': summary.refunded,
            'payment.due': summary.due,
            'payment.refundDue': summary.refundDue,
            'payment.status': summary.status,
            ...(totals?.lastPaidAt ? { 'payment.paidAt': totals.lastPaidAt } : {}),
        },
    });
    return summary;
}

// ---------- Final bill ----------

// Extra km/hours beyond the package, plus tolls and parking paid at actuals.
function settle(booking, { actualKm, tolls = 0, parking = 0 }, now = new Date()) {
    const rates = booking.rates || {};
    const startedAt = booking.trip?.startedAt ? new Date(booking.trip.startedAt) : new Date(booking.start);
    const actualHours = round(Math.max(0, now.getTime() - startedAt.getTime()) / HOUR, 2);
    const extraKm = rates.includedKm ? Math.max(0, Math.ceil(actualKm - rates.includedKm)) : 0;
    // 15 minutes of grace, then every started hour counts.
    const extraHours = rates.includedHours && rates.extraHourRate
        ? Math.max(0, Math.ceil(actualHours - rates.includedHours - 0.25))
        : 0;
    const extraKmCharge = rupees(extraKm * (rates.extraKmRate || 0));
    const extraHourCharge = rupees(extraHours * (rates.extraHourRate || 0));
    const gst = rupees(((extraKmCharge + extraHourCharge) * (rates.gstPercent || 0)) / 100);
    const total = extraKmCharge + extraHourCharge + gst + rupees(tolls) + rupees(parking);
    return {
        actualKm: round(actualKm, 1),
        actualHours: round(actualHours, 1),
        extraKm,
        extraKmCharge,
        extraHours,
        extraHourCharge,
        tolls: rupees(tolls),
        parking: rupees(parking),
        gst,
        total,
    };
}

module.exports = {
    AIRPORT,
    DESTINATIONS,
    PACKAGES,
    RENTAL_TYPE_LABELS,
    CLASS_LABELS,
    DEFAULT_RATES,
    OPEN_STATUSES,
    CHANGEABLE_STATUSES,
    HOUR,
    ensureRentalDefaults,
    getSettings,
    activeRates,
    planTrip,
    priceTrip,
    packageLabel,
    vehicleIssue,
    driverIssue,
    complianceAlerts,
    reserve,
    release,
    move,
    busyIds,
    nextReference,
    cancellationTerms,
    paymentSummary,
    refreshPayment,
    settle,
    calendarDays,
    nightsBetween,
    formatDate,
    formatDateTime,
};
