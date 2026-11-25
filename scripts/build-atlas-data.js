// Builds a complete, self-consistent test dataset as one JSON file per collection
// (MongoDB Extended JSON), ready to paste into MongoDB Atlas -> Data Explorer.
// Nothing is written to any database: documents are built with the app's own
// models, validated, priced with the real rate cards and written to seed-data/atlas/.
//
//   node scripts/build-atlas-data.js
//
// Dates are fixed (November-December 2026) so the files can be pasted any time;
// upcoming trips are in December so they stay in the future while you test.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { User, Driver, Admin } = require('../src/models/accounts');
const Car = require('../src/models/Car');
const { Booking } = require('../src/models/Booking');
const { FareConfig, Notification, SupportTicket, AuditLog, Feedback } = require('../src/models/misc');
const { Promo } = require('../src/models/Promo');
const { FleetOwner, RentalRate, Payment, Settings, Counter } = require('../src/models/rental');
const rentals = require('../src/services/rentals');
const { DEFAULT_CATEGORIES } = require('../src/services/fare');
const geo = require('../src/services/geo');
const { haversineKm, round } = require('../src/utils/geo');

const OUT = path.join(__dirname, '..', 'seed-data', 'atlas');
const PASSWORD = 'Demo@1234';
const HASH = bcrypt.hashSync(PASSWORD, 12);
const HOUR = 3600 * 1000;

// Readable, fixed ids: 64a1 + collection code + running number.
const codes = {};
const oid = (code, n) => new mongoose.Types.ObjectId(`64a1${code}${String(n).padStart(18, '0')}`);
const nextId = code => { codes[code] = (codes[code] || 0) + 1; return oid(code, codes[code]); };

// Times are written in India time for readability.
const ist = text => new Date(`${text.replace(' ', 'T')}:00+05:30`);
const at = (date, hours) => new Date(date.getTime() + hours * HOUR);

const place = name => {
    const p = geo.LANDMARKS.find(item => item.name.startsWith(name));
    return { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
};
const destination = key => {
    const { key: ignored, ...rest } = rentals.DESTINATIONS.find(item => item.key === key);
    return rest;
};
const roadKm = (a, b) => round(haversineKm(a, b) * 1.35, 1);
const pkg = key => rentals.PACKAGES.find(item => item.key === key);

const out = {};
function add(collection, Model, doc) {
    const instance = new Model(doc);
    const error = instance.validateSync();
    if (error) throw new Error(`${collection}: ${error.message}`);
    // Keep exactly the stored shape (defaults applied, hidden fields included).
    const plain = instance.toObject({ depopulate: true, versionKey: false, transform: false });
    (out[collection] = out[collection] || []).push(plain);
    return plain;
}

const CREATED = ist('2026-11-01 10:00');
const stamp = date => ({ createdAt: date, updatedAt: date });

// ---------------- Settings, prices ----------------
const settings = add('settings', Settings, {
    _id: nextId('5e'), key: 'global', gstPercent: 5, bufferMinutes: 60, minLeadHours: 2, maxAdvanceDays: 30,
    cancellation: { freeHours: 24, partialHours: 6, partialRefundPercent: 50 },
    upiId: 'rideit-demo@okaxis', supportPhone: '9000012345', supportEmail: 'support@ride-it.test',
    exclusions: 'Tolls, parking and interstate taxes are paid by the customer at actuals.', ...stamp(CREATED),
});
const rateDocs = {};
for (const rate of rentals.DEFAULT_RATES) rateDocs[rate.vehicleClass] = add('rentalrates', RentalRate, { _id: nextId('7a'), ...rate, active: true, ...stamp(CREATED) });
for (const category of DEFAULT_CATEGORIES) add('fareconfigs', FareConfig, { _id: nextId('fc'), ...category, active: true, ...stamp(CREATED) });

// ---------------- People ----------------
const account = (fields, n) => ({ password: HASH, tokenVersion: 0, ...stamp(at(CREATED, n)), ...fields });

const admins = {
    admin: add('admins', Admin, account({ _id: nextId('ad'), fullName: 'Demo Owner', username: 'admin', email: 'admin@ride-it.test', phoneNumber: '9000000001', adminRole: 'super', status: 'active' }, 0)),
    ops: add('admins', Admin, account({ _id: nextId('ad'), fullName: 'Neha Operations', username: 'ops', email: 'ops@ride-it.test', phoneNumber: '9000000002', adminRole: 'operations', status: 'active' }, 1)),
    support: add('admins', Admin, account({ _id: nextId('ad'), fullName: 'Arjun Support', username: 'support', email: 'support-agent@ride-it.test', phoneNumber: '9000000003', adminRole: 'support', status: 'active' }, 2)),
    // Suspended staff member: sign-in must be refused.
    former: add('admins', Admin, account({ _id: nextId('ad'), fullName: 'Former Staff', username: 'formerstaff', email: 'former@ride-it.test', phoneNumber: '9000000004', adminRole: 'operations', status: 'suspended' }, 3)),
};

const customers = {
    asha: add('users', User, account({ _id: nextId('c0'), fullName: 'Asha Verma', username: 'asha', email: 'asha@ride-it.test', phoneNumber: '9876500001', status: 'active',
        savedPlaces: [{ _id: nextId('5a'), label: 'Home', ...place('Lanka') }, { _id: nextId('5a'), label: 'Work', ...place('Sigra') }],
        trustedContact: { name: 'Meera (sister)', phone: '9811122233' }, rating: { total: 9, count: 2 } }, 4)),
    rohan: add('users', User, account({ _id: nextId('c0'), fullName: 'Rohan Mehta', username: 'rohan', email: 'rohan@ride-it.test', phoneNumber: '9876500002', status: 'active', rating: { total: 0, count: 0 } }, 5)),
    priya: add('users', User, account({ _id: nextId('c0'), fullName: 'Priya Singh', username: 'priya', email: 'priya@ride-it.test', phoneNumber: '9876500003', status: 'active', rating: { total: 0, count: 0 } }, 6)),
    vikram: add('users', User, account({ _id: nextId('c0'), fullName: 'Vikram Rao', username: 'vikram', email: 'vikram@ride-it.test', phoneNumber: '9876500004', status: 'active', rating: { total: 0, count: 0 } }, 7)),
    // Brand-new customer with no bookings: tests the empty states and first booking.
    neha: add('users', User, account({ _id: nextId('c0'), fullName: 'Neha Kapoor', username: 'neha', email: 'neha@ride-it.test', phoneNumber: '9876500005', status: 'active', rating: { total: 0, count: 0 } }, 8)),
    // Suspended customer: sign-in must be refused.
    karan: add('users', User, account({ _id: nextId('c0'), fullName: 'Karan Malhotra', username: 'karan', email: 'karan@ride-it.test', phoneNumber: '9876500006', status: 'suspended', rating: { total: 0, count: 0 } }, 9)),
};

const verified = { status: 'verified', verifiedOn: ist('2026-06-15 11:00'), reference: 'PV/VNS/2026/0412' };
const driver = (n, fields) => add('drivers', Driver, account({ _id: nextId('d0'), dob: '1986-04-12', isOnline: false, slots: [], rating: { total: 0, count: 0 }, ...fields }, 10 + n));
const drivers = {
    ravi: driver(1, { fullName: 'Ravi Kumar', username: 'ravi', email: 'ravi@ride-it.test', phoneNumber: '9123400001', drivingLicenseNumber: 'UP6520150001111', status: 'approved', licenseExpiry: ist('2029-05-31 00:00'), policeVerification: verified, emergencyContact: { name: 'Sunita Kumar', phone: '9123499001' } }),
    sunil: driver(2, { fullName: 'Sunil Yadav', username: 'sunil', email: 'sunil@ride-it.test', phoneNumber: '9123400002', drivingLicenseNumber: 'UP6520160002222', status: 'approved', licenseExpiry: ist('2028-10-31 00:00'), policeVerification: verified, emergencyContact: { name: 'Ramesh Yadav', phone: '9123499002' } }),
    // Licence expires 15 Dec 2026: shown as "expiring soon"; cannot take trips ending after that date.
    imran: driver(3, { fullName: 'Imran Khan', username: 'imran', email: 'imran@ride-it.test', phoneNumber: '9123400003', drivingLicenseNumber: 'UP6520120003333', status: 'approved', licenseExpiry: ist('2026-12-15 00:00'), policeVerification: verified, emergencyContact: { name: 'Salma Khan', phone: '9123499003' } }),
    // Police verification pending: approved but cannot be assigned.
    manoj: driver(4, { fullName: 'Manoj Tiwari', username: 'manoj', email: 'manoj@ride-it.test', phoneNumber: '9123400004', drivingLicenseNumber: 'UP6520180004444', status: 'approved', licenseExpiry: ist('2030-01-31 00:00'), policeVerification: { status: 'pending' } }),
    // Licence already expired: approved but blocked.
    ajay: driver(5, { fullName: 'Ajay Pandey', username: 'ajay', email: 'ajay@ride-it.test', phoneNumber: '9123400006', drivingLicenseNumber: 'UP6520100006666', status: 'approved', licenseExpiry: ist('2026-10-31 00:00'), policeVerification: verified, emergencyContact: { name: 'Kiran Pandey', phone: '9123499006' } }),
    // New application waiting for review (appears on the dashboard).
    deepak: driver(6, { fullName: 'Deepak Gupta', username: 'deepak', email: 'deepak@ride-it.test', phoneNumber: '9123400005', drivingLicenseNumber: 'UP6520200005555', status: 'pending', licenseExpiry: ist('2031-03-31 00:00'), policeVerification: { status: 'pending' }, emergencyContact: { name: 'Anita Gupta', phone: '9123499005' } }),
    // Rejected application (failed police check): sign-in is refused.
    farhan: driver(7, { fullName: 'Farhan Ali', username: 'farhan', email: 'farhan@ride-it.test', phoneNumber: '9123400007', drivingLicenseNumber: 'UP6520190007777', status: 'rejected', licenseExpiry: ist('2029-08-31 00:00'), policeVerification: { status: 'failed', reference: 'PV/VNS/2026/0981' } }),
    // Suspended chauffeur: sign-in refused.
    gopal: driver(8, { fullName: 'Gopal Mishra', username: 'gopal', email: 'gopal@ride-it.test', phoneNumber: '9123400008', drivingLicenseNumber: 'UP6520140008888', status: 'suspended', licenseExpiry: ist('2028-02-28 00:00'), policeVerification: verified }),
};

// ---------------- Fleet ----------------
const owners = {
    company: add('fleetowners', FleetOwner, { _id: nextId('f0'), name: 'RIDE-IT Fleet', type: 'company', phone: '9000012345', email: 'fleet@ride-it.test', address: 'Sigra, Varanasi', active: true, ...stamp(CREATED) }),
    shiv: add('fleetowners', FleetOwner, { _id: nextId('f0'), name: 'Shiv Travels', type: 'partner', phone: '9415000001', email: 'shivtravels@example.test', address: 'Lanka, Varanasi', agreement: { reference: 'AGR-2026-07', startsOn: ist('2026-07-01 00:00'), endsOn: ist('2027-06-30 00:00'), commissionPercent: 20, notes: 'Partner provides cars; RIDE-IT provides chauffeurs.' }, active: true, ...stamp(CREATED) }),
    // Agreement ends 20 Dec 2026: shown as ending soon.
    ganga: add('fleetowners', FleetOwner, { _id: nextId('f0'), name: 'Ganga Cabs', type: 'partner', phone: '9415000002', email: 'gangacabs@example.test', address: 'Cantonment, Varanasi', agreement: { reference: 'AGR-2025-12', startsOn: ist('2025-12-21 00:00'), endsOn: ist('2026-12-20 00:00'), commissionPercent: 15, notes: 'Renewal due in December.' }, active: true, ...stamp(CREATED) }),
    // Old partner, no longer active and no active cars.
    old: add('fleetowners', FleetOwner, { _id: nextId('f0'), name: 'Kashi Motors (ended)', type: 'partner', phone: '9415000003', agreement: { reference: 'AGR-2024-02', startsOn: ist('2024-02-01 00:00'), endsOn: ist('2026-01-31 00:00'), commissionPercent: 18 }, active: false, ...stamp(CREATED) }),
};

const docs = (suffix, overrides = {}) => ({
    rc: { number: `UP65RC${suffix}` },
    insurance: { number: `INS-${suffix}`, expiresOn: ist('2027-09-30 00:00') },
    permit: { number: `TP-${suffix}`, expiresOn: ist('2028-03-31 00:00') },
    fitness: { number: `FC-${suffix}`, expiresOn: ist('2027-12-31 00:00') },
    puc: { number: `PUC-${suffix}`, expiresOn: ist('2027-04-30 00:00') },
    ...overrides,
});
const car = fields => add('cars', Car, { _id: nextId('ca'), ac: true, maintenance: false, active: true, slots: [], ...stamp(CREATED), ...fields });
const cars = {
    swift: car({ name: 'Maruti Swift', image: '/cars/hatch.svg', category: 'hatchback', registrationNumber: 'UP65 FT 2101', capacity: 4, luggage: 2, fuelType: 'Petrol', transmission: 'Manual', owner: owners.company._id, documents: docs('2101') }),
    dzire: car({ name: 'Maruti Dzire', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 GT 3302', capacity: 4, luggage: 2, fuelType: 'CNG', transmission: 'Manual', owner: owners.company._id, documents: docs('3302') }),
    // Insurance ends 18 Dec 2026: bookable until then, flagged on the dashboard.
    city: car({ name: 'Honda City', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 HT 4410', capacity: 4, luggage: 3, fuelType: 'Petrol', transmission: 'Automatic', owner: owners.shiv._id, documents: docs('4410', { insurance: { number: 'INS-4410', expiresOn: ist('2026-12-18 00:00') } }) }),
    creta: car({ name: 'Hyundai Creta', image: '/cars/compact-suv.svg', category: 'suv', registrationNumber: 'UP65 KT 5521', capacity: 5, luggage: 3, fuelType: 'Diesel', transmission: 'Automatic', owner: owners.company._id, documents: docs('5521') }),
    ertiga: car({ name: 'Maruti Ertiga', image: '/cars/mpv.svg', category: 'muv', registrationNumber: 'UP65 MT 6630', capacity: 6, luggage: 3, fuelType: 'CNG', transmission: 'Manual', owner: owners.ganga._id, documents: docs('6630') }),
    innova: car({ name: 'Toyota Innova Crysta', image: '/cars/mpv.svg', category: 'muv', registrationNumber: 'UP65 NT 7745', capacity: 7, luggage: 4, fuelType: 'Diesel', transmission: 'Manual', owner: owners.shiv._id, documents: docs('7745') }),
    // In the workshop: not offered to customers.
    xuv: car({ name: 'Mahindra XUV700', image: '/cars/suv.svg', category: 'suv', registrationNumber: 'UP65 PT 8850', capacity: 7, luggage: 4, fuelType: 'Diesel', transmission: 'Automatic', owner: owners.company._id, maintenance: true, documents: docs('8850') }),
    // PUC expired: blocked until renewed.
    etios: car({ name: 'Toyota Etios', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 RT 9960', capacity: 4, luggage: 2, fuelType: 'Diesel', transmission: 'Manual', owner: owners.ganga._id, documents: docs('9960', { puc: { number: 'PUC-9960', expiresOn: ist('2026-11-01 00:00') } }) }),
    // Permit not entered yet: blocked with "Permit details are missing".
    wagonr: car({ name: 'Maruti WagonR', image: '/cars/hatch.svg', category: 'hatchback', registrationNumber: 'UP65 ST 1188', capacity: 4, luggage: 1, fuelType: 'CNG', transmission: 'Manual', owner: owners.company._id, documents: docs('1188', { permit: undefined }) }),
    // Retired car with past bookings: kept for history, hidden everywhere else.
    indica: car({ name: 'Tata Indica', image: '/cars/hatch.svg', category: 'hatchback', registrationNumber: 'UP65 AT 0442', capacity: 4, luggage: 1, fuelType: 'Diesel', transmission: 'Manual', owner: owners.old._id, active: false, documents: docs('0442') }),
};

// ---------------- Bookings ----------------
let seq = 0;
const bookingsById = {};
const paymentsFor = {};

function trip(rentalType, fields) {
    const t = { rentalType, ...fields };
    if (t.packageKey) t.package = pkg(t.packageKey);
    if (!t.end) {
        if (t.package) t.end = at(t.start, t.package.hours);
        else if (rentalType === 'airport') t.end = at(t.start, (t.distanceKm / 20) + (t.airportDirection === 'from_airport' ? 0.5 : 0));
        else t.end = at(t.start, t.distanceKm / 45);
    }
    if (rentalType.startsWith('outstation')) {
        t.days = rentalType === 'outstation_round' ? rentals.calendarDays(t.start, t.end) : Math.max(1, Math.ceil((2 * t.distanceKm / 45) / 24));
        t.nights = rentals.nightsBetween(t.start, t.end);
    }
    const returnDrive = rentalType === 'outstation_oneway' ? t.distanceKm / 45 : 0;
    t.blockEnd = at(t.end, returnDrive + settings.bufferMinutes / 60);
    return t;
}

const step = (status, when, by, note) => ({ status, at: when, by, ...(note ? { note } : {}) });
const OPEN = rentals.OPEN_STATUSES;

function booking({ user, car: carDoc, driver: driverDoc, status, t, created, paymentMethod = 'upi', timeline, extra = {}, payments = [] }) {
    seq += 1;
    const price = rentals.priceTrip(t, rateDocs[carDoc.category], settings);
    const id = nextId('b0');
    const doc = {
        _id: id,
        type: 'rental',
        reference: `BK${1000 + seq}`,
        user: user._id,
        driver: driverDoc?._id,
        car: carDoc._id,
        status,
        rentalType: t.rentalType,
        packageKey: t.package?.key,
        airportDirection: t.airportDirection,
        pickup: t.pickup,
        drop: t.drop,
        destination: t.destination,
        start: t.start,
        end: t.end,
        blockEnd: t.blockEnd,
        totalHours: round((t.end - t.start) / HOUR, 1),
        distanceKm: t.distanceKm,
        passengers: t.passengers,
        instructions: t.instructions,
        driverRequired: true,
        rates: price.rates,
        totalAmount: price.total,
        fareBreakdown: price.breakdown,
        pin: String(2000 + seq * 371).slice(-4),
        timeline: timeline || [step('pending_approval', created, 'customer')],
        createdAt: created,
        updatedAt: timeline ? timeline[timeline.length - 1].at : created,
        ...extra,
    };
    if (driverDoc && !doc.assignment) doc.assignment = { assignedAt: at(created, 1), acknowledgedAt: at(created, 3) };
    if (doc.settlementInput) {
        const s = rentals.settle({ ...doc }, doc.settlementInput, doc.trip.endedAt);
        doc.settlement = s;
        doc.finalAmount = doc.totalAmount + s.total;
        delete doc.settlementInput;
    }
    // Payment records, then the derived summary on the booking.
    const records = payments.map(p => ({ _id: nextId('9a'), booking: id, kind: p.kind || 'payment', amount: typeof p.amount === 'function' ? p.amount(doc) : p.amount, method: p.method, reference: p.reference, note: p.note, recordedBy: p.by, createdAt: p.at }));
    const paid = records.filter(r => r.kind === 'payment').reduce((sum, r) => sum + r.amount, 0);
    const refunded = records.filter(r => r.kind === 'refund').reduce((sum, r) => sum + r.amount, 0);
    if (doc.cancellationInput) {
        const terms = rentals.cancellationTerms({ ...doc, status: doc.cancellationInput.statusBefore, payment: { paid, refunded: 0 } }, settings, { refundPercent: doc.cancellationInput.refundPercent, now: doc.cancellationInput.at });
        doc.cancellation = { by: doc.cancellationInput.by, reason: doc.cancellationInput.reason, at: doc.cancellationInput.at, refundPercent: terms.refundPercent, charge: terms.charge };
        delete doc.cancellationInput;
    }
    const summary = rentals.paymentSummary(doc, paid, refunded);
    doc.payment = { method: paymentMethod, status: summary.status, paid, refunded, due: summary.due, refundDue: summary.refundDue, ...(paid ? { paidAt: records.filter(r => r.kind === 'payment').at(-1).createdAt } : {}) };
    const saved = add('bookings', Booking, doc);
    records.forEach(r => add('payments', Payment, r));
    bookingsById[saved.reference] = saved;
    paymentsFor[saved.reference] = records;

    // Open bookings hold the car (and driver) for [start, blockEnd).
    if (OPEN.includes(status)) {
        out.cars.find(c => c._id.equals(carDoc._id)).slots.push({ start: t.start, end: t.blockEnd, booking: id, active: true });
        if (driverDoc) out.drivers.find(d => d._id.equals(driverDoc._id)).slots.push({ start: t.start, end: t.blockEnd, booking: id, active: true });
    } else if (['cancelled', 'rejected', 'completed'].includes(status)) {
        // Released reservations stay in history as inactive slots.
        out.cars.find(c => c._id.equals(carDoc._id)).slots.push({ start: t.start, end: t.blockEnd, booking: id, active: false });
    }
    return saved;
}

const by = (who, role) => ({ id: who._id, role, name: who.fullName });
const OPS = by(admins.ops, 'admin');

// 1. Waiting for approval: full day, with instructions.
booking({ user: customers.asha, car: cars.dzire, status: 'pending_approval', created: ist('2026-11-24 19:10'),
    t: trip('full_day', { packageKey: '8h80', pickup: place('Lanka'), start: ist('2026-12-08 09:00'), passengers: 3, instructions: 'Temple visits: Kashi Vishwanath, Sankat Mochan, Durga Kund. Two senior citizens.' }) });
// 2. Waiting for approval: outstation round trip, 7 passengers in an MUV.
booking({ user: customers.rohan, car: cars.innova, status: 'pending_approval', created: ist('2026-11-24 21:40'),
    t: trip('outstation_round', { pickup: place('Varanasi Junction'), destination: destination('prayagraj'), distanceKm: roadKm(place('Varanasi Junction'), destination('prayagraj')), start: ist('2026-12-12 06:00'), end: ist('2026-12-13 19:00'), passengers: 7, instructions: 'Family trip for Sangam snan. Need roof carrier for luggage.' }) });
// 3. Waiting for approval: airport pickup (flight arrival), cash.
booking({ user: customers.vikram, car: cars.creta, status: 'pending_approval', paymentMethod: 'cash', created: ist('2026-11-25 08:05'),
    t: trip('airport', { airportDirection: 'from_airport', pickup: rentals.AIRPORT, drop: place('Assi'), distanceKm: roadKm(rentals.AIRPORT, place('Assi')), start: ist('2026-12-09 14:30'), passengers: 2, instructions: 'Flight 6E 2137 from Delhi, lands 14:20.' }) });
// 4. Waiting for approval: hourly 6 h / 60 km in a hatchback.
booking({ user: customers.priya, car: cars.swift, status: 'pending_approval', created: ist('2026-11-25 09:30'),
    t: trip('hourly', { packageKey: '6h60', pickup: place('Banaras'), drop: place('Godowlia'), start: ist('2026-12-07 15:00'), passengers: 2 }) });

// 5. Confirmed + acknowledged, advance paid by UPI (airport drop).
booking({ user: customers.priya, car: cars.creta, driver: drivers.ravi, status: 'confirmed', created: ist('2026-11-23 18:00'),
    t: trip('airport', { airportDirection: 'to_airport', pickup: place('Sigra'), drop: rentals.AIRPORT, distanceKm: roadKm(place('Sigra'), rentals.AIRPORT), start: ist('2026-12-05 06:00'), passengers: 2 }),
    timeline: [step('pending_approval', ist('2026-11-23 18:00'), 'customer'), step('confirmed', ist('2026-11-23 19:00'), 'admin', 'Car UP65 KT 5521 and driver Ravi Kumar assigned'), step('confirmed', ist('2026-11-23 21:00'), 'driver', 'Driver acknowledged the assignment')],
    payments: [{ amount: 500, method: 'upi', reference: 'UPI-58201933', note: 'Advance', by: OPS, at: ist('2026-11-23 20:15') }] });
// 6. Confirmed, driver NOT acknowledged yet (one-way to Ayodhya, cash).
booking({ user: customers.vikram, car: cars.ertiga, driver: drivers.sunil, status: 'confirmed', paymentMethod: 'cash', created: ist('2026-11-24 10:00'),
    t: trip('outstation_oneway', { pickup: place('Assi'), destination: destination('ayodhya'), distanceKm: roadKm(place('Assi'), destination('ayodhya')), start: ist('2026-12-06 07:00'), passengers: 5 }),
    extra: { assignment: { assignedAt: ist('2026-11-24 11:00') } },
    timeline: [step('pending_approval', ist('2026-11-24 10:00'), 'customer'), step('confirmed', ist('2026-11-24 11:00'), 'admin', 'Car UP65 MT 6630 and driver Sunil Yadav assigned')] });
// 7. Confirmed but the chauffeur declined: needs a new chauffeur.
booking({ user: customers.asha, car: cars.city, status: 'confirmed', created: ist('2026-11-22 12:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Sigra'), start: ist('2026-12-10 10:00'), passengers: 2 }),
    extra: { assignment: { declines: [{ driver: drivers.imran._id, reason: 'Family function that day', at: ist('2026-11-24 09:00') }] } },
    timeline: [step('pending_approval', ist('2026-11-22 12:00'), 'customer'), step('confirmed', ist('2026-11-22 13:00'), 'admin', 'Car UP65 HT 4410 and driver Imran Khan assigned'), step('confirmed', ist('2026-11-24 09:00'), 'driver', 'Driver declined: Family function that day')] });

// 8. Chauffeur has arrived (waiting for the PIN).
booking({ user: customers.asha, car: cars.dzire, driver: drivers.sunil, status: 'arrived', created: ist('2026-11-20 10:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Dashashwamedh'), start: ist('2026-11-25 17:00'), passengers: 2 }),
    extra: { activeDriver: true },
    timeline: [step('pending_approval', ist('2026-11-20 10:00'), 'customer'), step('confirmed', ist('2026-11-20 11:00'), 'admin'), step('arrived', ist('2026-11-25 16:50'), 'driver')] });
// 9. Trip under way (SOS available), odometer recorded.
booking({ user: customers.rohan, car: cars.swift, driver: drivers.imran, status: 'in_progress', created: ist('2026-11-21 09:00'),
    t: trip('full_day', { packageKey: '8h80', pickup: place('Godowlia'), drop: place('Sarnath'), start: ist('2026-11-25 09:00'), passengers: 2 }),
    extra: { activeDriver: true, trip: { startOdometer: 41230, startedAt: ist('2026-11-25 09:05') }, sosAt: ist('2026-11-25 12:40') },
    timeline: [step('pending_approval', ist('2026-11-21 09:00'), 'customer'), step('confirmed', ist('2026-11-21 10:00'), 'admin'), step('arrived', ist('2026-11-25 08:55'), 'driver'), step('in_progress', ist('2026-11-25 09:05'), 'driver')] });

// 10. Completed, extra km + tolls + parking, paid in full, rated 5.
booking({ user: customers.asha, car: cars.city, driver: drivers.ravi, status: 'completed', created: ist('2026-11-15 10:00'),
    t: trip('full_day', { packageKey: '8h80', pickup: place('Lanka'), drop: place('Sarnath'), start: ist('2026-11-20 08:00'), passengers: 4 }),
    extra: { trip: { startOdometer: 52010, endOdometer: 52106, startedAt: ist('2026-11-20 08:00'), endedAt: ist('2026-11-20 16:30') }, settlementInput: { actualKm: 96, tolls: 60, parking: 50 },
        ratingByCustomer: { score: 5, comment: 'Ravi ji was patient at every temple. Clean car.', at: ist('2026-11-20 18:00') }, ratingByDriver: { score: 5, comment: 'Very polite family.', at: ist('2026-11-20 17:00') } },
    timeline: [step('pending_approval', ist('2026-11-15 10:00'), 'customer'), step('confirmed', ist('2026-11-15 11:00'), 'admin'), step('arrived', ist('2026-11-20 07:50'), 'driver'), step('in_progress', ist('2026-11-20 08:00'), 'driver'), step('completed', ist('2026-11-20 16:30'), 'driver', 'Final bill')],
    payments: [{ amount: 1000, method: 'upi', reference: 'UPI-47110022', note: 'Advance', by: OPS, at: ist('2026-11-16 12:00') }, { amount: d => d.finalAmount - 1000, method: 'cash', note: 'Collected at drop-off', by: by(drivers.ravi, 'driver'), at: ist('2026-11-20 16:30') }] });
// 11. Completed airport pickup, extra waiting hour, paid cash to driver, rated 4.
booking({ user: customers.vikram, car: cars.dzire, driver: drivers.imran, status: 'completed', paymentMethod: 'cash', created: ist('2026-11-14 09:00'),
    t: trip('airport', { airportDirection: 'from_airport', pickup: rentals.AIRPORT, drop: place('Assi'), distanceKm: roadKm(rentals.AIRPORT, place('Assi')), start: ist('2026-11-18 20:00'), passengers: 1 }),
    extra: { trip: { startOdometer: 30440, endOdometer: 30472, startedAt: ist('2026-11-18 20:00'), endedAt: ist('2026-11-18 23:05') }, settlementInput: { actualKm: 32 },
        ratingByCustomer: { score: 4, comment: 'Flight was late, driver waited without fuss.', at: ist('2026-11-19 09:00') }, ratingByDriver: { score: 4, at: ist('2026-11-18 23:10') } },
    timeline: [step('pending_approval', ist('2026-11-14 09:00'), 'customer'), step('confirmed', ist('2026-11-14 10:00'), 'admin'), step('in_progress', ist('2026-11-18 20:00'), 'driver'), step('completed', ist('2026-11-18 23:05'), 'driver')],
    payments: [{ amount: d => d.finalAmount, method: 'cash', note: 'Collected at drop-off', by: by(drivers.imran, 'driver'), at: ist('2026-11-18 23:05') }] });
// 12. Completed outstation round trip, only partly paid (balance due), LOW rating (2) for follow-up.
booking({ user: customers.rohan, car: cars.innova, driver: drivers.ravi, status: 'completed', created: ist('2026-11-08 12:00'),
    t: trip('outstation_round', { pickup: place('Sigra'), destination: destination('bodh_gaya'), distanceKm: roadKm(place('Sigra'), destination('bodh_gaya')), start: ist('2026-11-11 05:00'), end: ist('2026-11-12 22:00'), passengers: 6 }),
    extra: { trip: { startOdometer: 88000, endOdometer: 88612, startedAt: ist('2026-11-11 05:10'), endedAt: ist('2026-11-12 22:30') }, settlementInput: { actualKm: 612, tolls: 640, parking: 100 },
        ratingByCustomer: { score: 2, comment: 'Car AC was weak on the way back and we were late.', at: ist('2026-11-13 10:00') } },
    timeline: [step('pending_approval', ist('2026-11-08 12:00'), 'customer'), step('confirmed', ist('2026-11-08 13:00'), 'admin'), step('in_progress', ist('2026-11-11 05:10'), 'driver'), step('completed', ist('2026-11-12 22:30'), 'driver')],
    payments: [{ amount: 3000, method: 'upi', reference: 'UPI-30118842', note: 'Advance', by: OPS, at: ist('2026-11-09 10:00') }, { amount: 4000, method: 'cash', note: 'Collected at drop-off', by: by(drivers.ravi, 'driver'), at: ist('2026-11-12 22:30') }] });
// 13. Completed but OVERPAID: refund due to the customer; not rated yet (test the rating form).
booking({ user: customers.priya, car: cars.swift, driver: drivers.sunil, status: 'completed', created: ist('2026-11-19 08:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Assi'), start: ist('2026-11-21 10:00'), passengers: 2 }),
    extra: { trip: { startOdometer: 20100, endOdometer: 20131, startedAt: ist('2026-11-21 10:00'), endedAt: ist('2026-11-21 13:40') }, settlementInput: { actualKm: 31 } },
    timeline: [step('pending_approval', ist('2026-11-19 08:00'), 'customer'), step('confirmed', ist('2026-11-19 09:00'), 'admin'), step('in_progress', ist('2026-11-21 10:00'), 'driver'), step('completed', ist('2026-11-21 13:40'), 'driver')],
    payments: [{ amount: 1500, method: 'upi', reference: 'UPI-77120090', note: 'Paid in full in advance', by: OPS, at: ist('2026-11-19 12:00') }] });

// 14. Cancelled by customer more than 24 h before: full refund still to send.
booking({ user: customers.priya, car: cars.city, status: 'cancelled', created: ist('2026-11-18 10:00'),
    t: trip('hourly', { packageKey: '6h60', pickup: place('Banaras'), start: ist('2026-11-23 10:00'), passengers: 2 }),
    extra: { cancellationInput: { by: 'customer', reason: 'Meeting moved to next week', at: ist('2026-11-21 20:00'), statusBefore: 'confirmed' } },
    timeline: [step('pending_approval', ist('2026-11-18 10:00'), 'customer'), step('confirmed', ist('2026-11-18 12:00'), 'admin'), step('cancelled', ist('2026-11-21 20:00'), 'customer', 'Meeting moved to next week')],
    payments: [{ amount: 600, method: 'upi', reference: 'UPI-33019874', by: OPS, at: ist('2026-11-18 15:00') }] });
// 15. Cancelled by customer under 6 h before: no refund, advance kept.
booking({ user: customers.rohan, car: cars.creta, status: 'cancelled', created: ist('2026-11-17 10:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Sigra'), start: ist('2026-11-22 18:00'), passengers: 3 }),
    extra: { cancellationInput: { by: 'customer', reason: 'Plans changed at the last minute', at: ist('2026-11-22 14:00'), statusBefore: 'confirmed' } },
    timeline: [step('pending_approval', ist('2026-11-17 10:00'), 'customer'), step('confirmed', ist('2026-11-17 11:00'), 'admin'), step('cancelled', ist('2026-11-22 14:00'), 'customer', 'Plans changed at the last minute')],
    payments: [{ amount: 500, method: 'upi', reference: 'UPI-21009911', by: OPS, at: ist('2026-11-17 13:00') }] });
// 16. Cancelled by admin as a no-show (0% refund), nothing had been paid.
booking({ user: customers.asha, car: cars.ertiga, status: 'cancelled', paymentMethod: 'cash', created: ist('2026-11-16 09:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Lanka'), start: ist('2026-11-19 07:00'), passengers: 4 }),
    extra: { cancellationInput: { by: 'admin', reason: 'Customer did not come to the pickup point (no-show)', at: ist('2026-11-19 07:45'), statusBefore: 'arrived', refundPercent: 0 } },
    timeline: [step('pending_approval', ist('2026-11-16 09:00'), 'customer'), step('confirmed', ist('2026-11-16 10:00'), 'admin'), step('arrived', ist('2026-11-19 06:55'), 'driver'), step('cancelled', ist('2026-11-19 07:45'), 'admin', 'Customer did not come to the pickup point (no-show)')] });
// 17. Cancelled 6-24 h before: 50% refund, half of the refund already sent (partly refunded).
booking({ user: customers.vikram, car: cars.innova, status: 'cancelled', created: ist('2026-11-10 10:00'),
    t: trip('full_day', { packageKey: '12h120', pickup: place('Varanasi Junction'), start: ist('2026-11-16 08:00'), passengers: 6 }),
    extra: { cancellationInput: { by: 'customer', reason: 'Guests cancelled their visit', at: ist('2026-11-15 20:00'), statusBefore: 'confirmed' } },
    timeline: [step('pending_approval', ist('2026-11-10 10:00'), 'customer'), step('confirmed', ist('2026-11-10 11:00'), 'admin'), step('cancelled', ist('2026-11-15 20:00'), 'customer', 'Guests cancelled their visit')],
    payments: [{ amount: 4000, method: 'upi', reference: 'UPI-60021187', by: OPS, at: ist('2026-11-10 14:00') }, { kind: 'refund', amount: 1000, method: 'upi', reference: 'RFND-60021187-1', note: 'First part of refund', by: OPS, at: ist('2026-11-17 11:00') }] });
// 18. Cancelled more than 24 h before and fully refunded.
booking({ user: customers.priya, car: cars.dzire, status: 'cancelled', created: ist('2026-11-05 10:00'),
    t: trip('airport', { airportDirection: 'to_airport', pickup: place('Lanka'), drop: rentals.AIRPORT, distanceKm: roadKm(place('Lanka'), rentals.AIRPORT), start: ist('2026-11-14 05:00'), passengers: 1 }),
    extra: { cancellationInput: { by: 'customer', reason: 'Flight rescheduled', at: ist('2026-11-10 09:00'), statusBefore: 'confirmed' } },
    timeline: [step('pending_approval', ist('2026-11-05 10:00'), 'customer'), step('confirmed', ist('2026-11-05 11:00'), 'admin'), step('cancelled', ist('2026-11-10 09:00'), 'customer', 'Flight rescheduled')],
    payments: [{ amount: 800, method: 'upi', reference: 'UPI-10200300', by: OPS, at: ist('2026-11-05 13:00') }, { kind: 'refund', amount: 800, method: 'upi', reference: 'RFND-10200300', by: OPS, at: ist('2026-11-11 10:00') }] });
// 19. Cancelled before approval: always free.
booking({ user: customers.rohan, car: cars.dzire, status: 'cancelled', created: ist('2026-11-24 08:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Godowlia'), start: ist('2026-12-02 11:00'), passengers: 2 }),
    extra: { cancellationInput: { by: 'customer', reason: 'Booked by mistake', at: ist('2026-11-24 08:30'), statusBefore: 'pending_approval' } },
    timeline: [step('pending_approval', ist('2026-11-24 08:00'), 'customer'), step('cancelled', ist('2026-11-24 08:30'), 'customer', 'Booked by mistake')] });
// 20. Rejected by operations with a reason.
booking({ user: customers.vikram, car: cars.innova, status: 'rejected', created: ist('2026-11-24 15:00'),
    t: trip('outstation_oneway', { pickup: place('Sigra'), destination: destination('patna'), distanceKm: roadKm(place('Sigra'), destination('patna')), start: ist('2026-12-14 06:00'), passengers: 7 }),
    extra: { rejection: { reason: 'No 7-seater with a valid Bihar permit on that date. Please try a sedan or another date.', at: ist('2026-11-24 17:00') } },
    timeline: [step('pending_approval', ist('2026-11-24 15:00'), 'customer'), step('rejected', ist('2026-11-24 17:00'), 'admin', 'No 7-seater with a valid Bihar permit on that date.')] });
// 21. Old trip in the retired car (keeps history).
booking({ user: customers.asha, car: cars.indica, driver: drivers.sunil, status: 'completed', paymentMethod: 'cash', created: ist('2026-10-02 10:00'),
    t: trip('hourly', { packageKey: '4h40', pickup: place('Sigra'), start: ist('2026-10-05 10:00'), passengers: 2 }),
    extra: { trip: { startOdometer: 150200, endOdometer: 150236, startedAt: ist('2026-10-05 10:00'), endedAt: ist('2026-10-05 13:50') }, settlementInput: { actualKm: 36 }, ratingByCustomer: { score: 4, at: ist('2026-10-05 15:00') } },
    timeline: [step('pending_approval', ist('2026-10-02 10:00'), 'customer'), step('confirmed', ist('2026-10-02 11:00'), 'admin'), step('in_progress', ist('2026-10-05 10:00'), 'driver'), step('completed', ist('2026-10-05 13:50'), 'driver')],
    payments: [{ amount: d => d.finalAmount, method: 'cash', by: by(drivers.sunil, 'driver'), at: ist('2026-10-05 13:50') }] });

// Driver ratings must match the trips rated by customers.
for (const b of out.bookings) {
    if (b.ratingByCustomer && b.driver) {
        const d = out.drivers.find(x => x._id.equals(b.driver));
        d.rating.total += b.ratingByCustomer.score;
        d.rating.count += 1;
    }
}
add('counters', Counter, { _id: 'booking', seq });

// ---------------- Support, notifications, feedback, audit, promos ----------------
const B = ref => bookingsById[ref];
const ticket = fields => add('supporttickets', SupportTicket, { _id: nextId('5b'), ...fields });
ticket({ requester: customers.rohan._id, requesterRole: 'customer', requesterName: 'Rohan Mehta', requesterEmail: 'rohan@ride-it.test', booking: B('BK1009')._id, subject: 'SOS: rider needs urgent help', message: 'Emergency raised during a in progress trip (BK1009). Rider location: 25.32010, 83.01540. Rider phone: 9876500002.', source: 'sos', priority: 'urgent', status: 'open', createdAt: ist('2026-11-25 12:40'), updatedAt: ist('2026-11-25 12:40') });
ticket({ requester: drivers.sunil._id, requesterRole: 'driver', requesterName: 'Sunil Yadav', requesterEmail: 'sunil@ride-it.test', booking: B('BK1008')._id, subject: 'BK1008: Vehicle breakdown', message: 'Front left tyre puncture near Dashashwamedh. Need a replacement car or 30 minutes.\n\nDriver phone: 9123400002', source: 'trip_issue', priority: 'urgent', status: 'in_progress', adminReply: 'Sending UP65 FT 2101 as replacement; ETA 20 min.', createdAt: ist('2026-11-25 16:55'), updatedAt: ist('2026-11-25 17:00') });
ticket({ requester: drivers.ravi._id, requesterRole: 'driver', requesterName: 'Ravi Kumar', requesterEmail: 'ravi@ride-it.test', booking: B('BK1012')._id, subject: 'BK1012: Customer issue', message: 'Customer asked for an extra stop at Gaya town that was not in the plan.\n\nDriver phone: 9123400001', source: 'trip_issue', priority: 'normal', status: 'resolved', adminReply: 'Approved; extra km is charged on the final bill.', createdAt: ist('2026-11-12 09:00'), updatedAt: ist('2026-11-12 09:30') });
ticket({ requester: customers.asha._id, requesterRole: 'customer', requesterName: 'Asha Verma', requesterEmail: 'asha@ride-it.test', booking: B('BK1001')._id, subject: 'Help with my booking', message: 'Can the driver also take us to Ramnagar Fort in the same full-day package?', source: 'form', priority: 'normal', status: 'open', createdAt: ist('2026-11-25 09:00'), updatedAt: ist('2026-11-25 09:00') });
ticket({ requester: customers.priya._id, requesterRole: 'customer', requesterName: 'Priya Singh', requesterEmail: 'priya@ride-it.test', booking: B('BK1014')._id, subject: 'Refund for cancelled booking', message: 'I cancelled BK1014 two days in advance. When will I get my ₹600 back?', source: 'chatbot', priority: 'normal', status: 'in_progress', adminReply: 'Your full refund is approved and will reach your UPI within 3 working days.', createdAt: ist('2026-11-23 10:00'), updatedAt: ist('2026-11-23 12:00') });

const note = fields => add('notifications', Notification, { _id: nextId('70'), ...fields });
note({ recipient: customers.priya._id, recipientRole: 'customer', type: 'booking.confirmed', title: 'BK1005: Booking confirmed', body: 'Your car and chauffeur are confirmed. Driver details are in your booking.', booking: B('BK1005')._id, createdAt: ist('2026-11-23 19:00'), updatedAt: ist('2026-11-23 19:00') });
note({ recipient: customers.priya._id, recipientRole: 'customer', type: 'payment.payment', title: 'BK1005: payment of ₹500 received', body: 'Paid so far ₹500.', booking: B('BK1005')._id, readAt: ist('2026-11-23 21:00'), createdAt: ist('2026-11-23 20:15'), updatedAt: ist('2026-11-23 21:00') });
note({ recipient: customers.vikram._id, recipientRole: 'customer', type: 'booking.rejected', title: 'BK1020: Booking not confirmed', body: 'Sorry, we could not confirm this booking. Reason: No 7-seater with a valid Bihar permit on that date. Please try a sedan or another date.', booking: B('BK1020')._id, createdAt: ist('2026-11-24 17:00'), updatedAt: ist('2026-11-24 17:00') });
note({ recipient: customers.asha._id, recipientRole: 'customer', type: 'booking.arrived', title: 'BK1008: Your chauffeur has arrived', body: 'Share your 4-digit PIN with the driver to start the trip.', booking: B('BK1008')._id, createdAt: ist('2026-11-25 16:50'), updatedAt: ist('2026-11-25 16:50') });
note({ recipient: drivers.sunil._id, recipientRole: 'driver', type: 'assignment.new', title: 'New trip BK1006', body: 'Outstation one-way · pickup 6 Dec, 7:00 am · Maruti Ertiga UP65 MT 6630', booking: B('BK1006')._id, createdAt: ist('2026-11-24 11:00'), updatedAt: ist('2026-11-24 11:00') });
note({ recipient: admins.ops._id, recipientRole: 'admin', type: 'booking.request', title: 'New request BK1004', body: 'Hourly local · Maruti Swift · 7 Dec, 3:00 pm', booking: B('BK1004')._id, createdAt: ist('2026-11-25 09:30'), updatedAt: ist('2026-11-25 09:30') });
note({ recipient: admins.ops._id, recipientRole: 'admin', type: 'booking.request', title: 'BK1007: driver needed', body: 'Imran Khan declined (Family function that day). Pickup 10 Dec, 10:00 am.', booking: B('BK1007')._id, createdAt: ist('2026-11-24 09:00'), updatedAt: ist('2026-11-24 09:00') });
note({ recipient: drivers.deepak._id, recipientRole: 'driver', type: 'support.update', title: 'Application received', body: 'Our team will verify your licence and police verification.', createdAt: ist('2026-11-22 10:00'), updatedAt: ist('2026-11-22 10:00') });

add('feedbacks', Feedback, { _id: nextId('fb'), appRating: 5, additionalComments: 'Booking a car with driver for the whole day was simple. Loved the price breakdown.', userId: customers.asha._id, createdAt: ist('2026-11-20 19:00'), updatedAt: ist('2026-11-20 19:00') });
add('feedbacks', Feedback, { _id: nextId('fb'), appRating: 4, additionalComments: 'Would like to pay online by card too.', userId: customers.vikram._id, createdAt: ist('2026-11-19 10:00'), updatedAt: ist('2026-11-19 10:00') });
add('feedbacks', Feedback, { _id: nextId('fb'), appRating: 2, additionalComments: 'Final bill had extra km I did not expect. Please show it more clearly.', userId: customers.rohan._id, createdAt: ist('2026-11-13 11:00'), updatedAt: ist('2026-11-13 11:00') });
add('feedbacks', Feedback, { _id: nextId('fb'), appRating: 5, additionalComments: 'Assignments arrive early, easy to plan my day.', driverId: drivers.ravi._id, createdAt: ist('2026-11-21 08:00'), updatedAt: ist('2026-11-21 08:00') });

const audit = (actor, role, action, targetType, targetId, meta, when) => add('auditlogs', AuditLog, { _id: nextId('a1'), actor: actor?._id, actorRole: role, action, targetType, targetId, meta, createdAt: when });
audit(admins.ops, 'admin', 'booking.approve', 'booking', B('BK1005')._id, { driver: drivers.ravi._id }, ist('2026-11-23 19:00'));
audit(admins.ops, 'admin', 'booking.payment_payment', 'booking', B('BK1005')._id, { amount: 500, method: 'upi' }, ist('2026-11-23 20:15'));
audit(admins.ops, 'admin', 'booking.reject', 'booking', B('BK1020')._id, { reason: 'No 7-seater with a valid Bihar permit' }, ist('2026-11-24 17:00'));
audit(drivers.imran, 'driver', 'booking.decline', 'booking', B('BK1007')._id, { reason: 'Family function that day' }, ist('2026-11-24 09:00'));
audit(admins.admin, 'admin', 'rates.update', 'rates', rateDocs.sedan._id, { extraKmRate: 13 }, ist('2026-11-02 10:00'));
audit(admins.admin, 'admin', 'admin.update', 'admin', admins.former._id, { fields: ['status'] }, ist('2026-11-10 10:00'));
audit(customers.neha, 'customer', 'account.register', 'customer', customers.neha._id, undefined, at(CREATED, 8));

// Promo codes are used only when instant rides are switched on (RIDES_ENABLED=true).
const promo = fields => add('promos', Promo, { _id: nextId('9c'), usedCount: 0, public: true, active: true, perUserLimit: 1, usageLimit: 0, maxDiscount: 0, minFare: 0, categories: [], validFrom: CREATED, ...stamp(CREATED), ...fields });
promo({ code: 'WELCOME50', description: 'Half off your ride, up to ₹100', kind: 'percent', value: 50, maxDiscount: 100, validUntil: ist('2027-01-31 23:59') });
promo({ code: 'AUTO20', description: '₹20 off any auto ride', kind: 'flat', value: 20, categories: ['auto'], perUserLimit: 5, validUntil: ist('2027-01-31 23:59') });
promo({ code: 'STAFFONLY', description: 'Internal test code (hidden)', kind: 'percent', value: 10, public: false, validUntil: ist('2027-01-31 23:59') });
promo({ code: 'DIWALI25', description: 'Expired festival offer', kind: 'percent', value: 25, maxDiscount: 150, validUntil: ist('2026-11-05 23:59') });
out.promoredemptions = [];

// ---------------- Write files ----------------
// Replace the JSON files (not the folder, which may be open in an editor or shell).
if (fs.existsSync(OUT)) for (const file of fs.readdirSync(OUT)) if (file.endsWith('.json')) fs.rmSync(path.join(OUT, file));
fs.mkdirSync(OUT, { recursive: true });
const order = ['settings', 'rentalrates', 'fareconfigs', 'admins', 'users', 'drivers', 'fleetowners', 'cars', 'bookings', 'payments', 'counters', 'supporttickets', 'notifications', 'feedbacks', 'auditlogs', 'promos', 'promoredemptions'];
for (const name of order) {
    fs.writeFileSync(path.join(OUT, `${name}.json`), EJSON.stringify(out[name] || [], null, 2, { relaxed: true }));
    console.log(`${name.padEnd(17)} ${(out[name] || []).length}`);
}
// Index definitions (fields + options) exactly as the app's models declare them,
// to create by hand in Atlas -> collection -> Indexes -> Create Index.
const indexes = [];
for (const model of Object.values(mongoose.models)) {
    for (const [keys, { background, ...options }] of model.schema.indexes()) {
        indexes.push({ collection: model.collection.collectionName, keys, options });
    }
}
fs.writeFileSync(path.join(OUT, '_indexes.json'), JSON.stringify(indexes, null, 2));
console.log(`_indexes          ${indexes.length}`);
console.log(`\nWritten to ${OUT}`);
