// Fills a LOCAL database with synthetic demo data for the chauffeur-rental
// launch. Never point this at production.
// Usage: npm run seed            (adds data if the database is empty)
//        npm run seed -- --reset (wipes the local database first)
const mongoose = require('mongoose');
const { config } = require('../src/config/env');
const { connectDB } = require('../src/config/database');
const { assertLocalDatabase } = require('./assert-local-db');
const { User, Driver, Admin } = require('../src/modules/accounts/account.model');
const Car = require('../src/modules/fleet/car.model');
const { Booking } = require('../src/modules/bookings/booking.model');
const { Feedback } = require('../src/modules/support/feedback.model');
const { FleetOwner } = require('../src/modules/fleet/fleet-owner.model');
const { Payment } = require('../src/modules/payments/payment.model');
const { Settings } = require('../src/modules/settings/settings.model');
const { hashPassword } = require('../src/modules/auth/auth.service');
const fare = require('../src/modules/rides/fare.service');
const geo = require('../src/modules/geo/geo.service');
const rentals = require('../src/modules/rentals/rental.service');
const { haversineKm, round } = require('../src/core/geo-math');

const DEMO_PASSWORD = 'Demo@1234';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const place = name => {
    const p = geo.LANDMARKS.find(landmark => landmark.name.startsWith(name));
    return { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
};
const destination = key => {
    const { key: ignored, ...rest } = rentals.DESTINATIONS.find(item => item.key === key);
    return rest;
};
// Whole hours from now, so demo times look like real bookings (e.g. 9:00, not 9:17).
const fromNow = hours => {
    const date = new Date(Date.now() + hours * HOUR);
    date.setMinutes(0, 0, 0);
    return date;
};
const inDays = days => new Date(Date.now() + days * DAY);

// Offline distance estimate (no map service needed for seeding).
const roadKm = (a, b) => round(haversineKm(a, b) * 1.35, 1);

async function main() {
    assertLocalDatabase(config.mongoUri || '');
    await connectDB();
    if (process.argv.includes('--reset')) {
        await mongoose.connection.dropDatabase();
        console.log('Local database reset.');
    }
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await fare.ensureDefaultCategories();
    await rentals.ensureRentalDefaults();

    if (await User.estimatedDocumentCount()) {
        console.log('Database already has data. Use --reset to start over.');
        return;
    }
    const password = await hashPassword(DEMO_PASSWORD);

    await Settings.updateOne({ key: 'global' }, { $set: { upiId: 'rideit-demo@okaxis', supportPhone: '9000012345', supportEmail: 'support@ride-it.test' } });
    const settings = await rentals.getSettings();

    // ---------- People ----------
    const admins = await Admin.create([
        { fullName: 'Demo Owner', username: 'admin', email: 'admin@ride-it.test', phoneNumber: '9000000001', password, adminRole: 'super' },
        { fullName: 'Neha Operations', username: 'ops', email: 'ops@ride-it.test', phoneNumber: '9000000002', password, adminRole: 'operations' },
        { fullName: 'Arjun Support', username: 'support', email: 'support-agent@ride-it.test', phoneNumber: '9000000003', password, adminRole: 'support' },
    ]);

    const [asha, rohan, priya, vikram] = await User.create([
        { fullName: 'Asha Verma', username: 'asha', email: 'asha@ride-it.test', phoneNumber: '9876500001', password, savedPlaces: [{ label: 'Home', ...place('Lanka') }, { label: 'Work', ...place('Sigra') }], trustedContact: { name: 'Meera (sister)', phone: '9811122233' } },
        { fullName: 'Rohan Mehta', username: 'rohan', email: 'rohan@ride-it.test', phoneNumber: '9876500002', password },
        { fullName: 'Priya Singh', username: 'priya', email: 'priya@ride-it.test', phoneNumber: '9876500003', password },
        { fullName: 'Vikram Rao', username: 'vikram', email: 'vikram@ride-it.test', phoneNumber: '9876500004', password },
    ]);

    const verified = { status: 'verified', verifiedOn: inDays(-120), reference: 'PV/VNS/2026/0412' };
    const driverBase = { password, dob: '1986-04-12', status: 'approved', isOnline: false };
    const [ravi, sunil, imran, manoj] = await Driver.create([
        { ...driverBase, fullName: 'Ravi Kumar', username: 'ravi', email: 'ravi@ride-it.test', phoneNumber: '9123400001', drivingLicenseNumber: 'UP6520150001111', licenseExpiry: inDays(900), policeVerification: verified, emergencyContact: { name: 'Sunita Kumar', phone: '9123499001' } },
        { ...driverBase, fullName: 'Sunil Yadav', username: 'sunil', email: 'sunil@ride-it.test', phoneNumber: '9123400002', drivingLicenseNumber: 'UP6520160002222', licenseExpiry: inDays(700), policeVerification: verified, emergencyContact: { name: 'Ramesh Yadav', phone: '9123499002' } },
        // Licence runs out soon: shows up in the compliance alerts.
        { ...driverBase, fullName: 'Imran Khan', username: 'imran', email: 'imran@ride-it.test', phoneNumber: '9123400003', drivingLicenseNumber: 'UP6520120003333', licenseExpiry: inDays(20), policeVerification: verified, emergencyContact: { name: 'Salma Khan', phone: '9123499003' } },
        // Police verification still pending: cannot be assigned.
        { ...driverBase, fullName: 'Manoj Tiwari', username: 'manoj', email: 'manoj@ride-it.test', phoneNumber: '9123400004', drivingLicenseNumber: 'UP6520180004444', licenseExpiry: inDays(1200), policeVerification: { status: 'pending' } },
        // New application waiting for review.
        { ...driverBase, status: 'pending', fullName: 'Deepak Gupta', username: 'deepak', email: 'deepak@ride-it.test', phoneNumber: '9123400005', drivingLicenseNumber: 'UP6520200005555', licenseExpiry: inDays(1500) },
    ]);

    // ---------- Fleet ----------
    const [company, shiv, ganga] = await FleetOwner.create([
        { name: 'RIDE-IT Fleet', type: 'company', phone: '9000012345', email: 'fleet@ride-it.test', address: 'Sigra, Varanasi' },
        { name: 'Shiv Travels', type: 'partner', phone: '9415000001', email: 'shivtravels@example.test', address: 'Lanka, Varanasi', agreement: { reference: 'AGR-2026-07', startsOn: inDays(-150), endsOn: inDays(215), commissionPercent: 20, notes: 'Partner provides cars; RIDE-IT provides chauffeurs.' } },
        { name: 'Ganga Cabs', type: 'partner', phone: '9415000002', email: 'gangacabs@example.test', address: 'Cantonment, Varanasi', agreement: { reference: 'AGR-2026-11', startsOn: inDays(-30), endsOn: inDays(25), commissionPercent: 15, notes: 'Renewal due this month.' } },
    ]);

    const docs = (suffix, overrides = {}) => ({
        rc: { number: `UP65RC${suffix}` },
        insurance: { number: `INS-${suffix}`, expiresOn: inDays(300) },
        permit: { number: `TP-${suffix}`, expiresOn: inDays(500) },
        fitness: { number: `FC-${suffix}`, expiresOn: inDays(400) },
        puc: { number: `PUC-${suffix}`, expiresOn: inDays(150) },
        ...overrides,
    });
    const [swift, dzire, city, creta, ertiga, innova] = await Car.create([
        { name: 'Maruti Swift', image: '/cars/hatch.svg', category: 'hatchback', registrationNumber: 'UP65 FT 2101', capacity: 4, luggage: 2, fuelType: 'Petrol', transmission: 'Manual', owner: company._id, documents: docs('2101') },
        { name: 'Maruti Dzire', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 GT 3302', capacity: 4, luggage: 2, fuelType: 'CNG', transmission: 'Manual', owner: company._id, documents: docs('3302') },
        // Insurance renewal due in 12 days: bookable for now, flagged on the dashboard.
        { name: 'Honda City', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 HT 4410', capacity: 4, luggage: 3, fuelType: 'Petrol', transmission: 'Automatic', owner: shiv._id, documents: docs('4410', { insurance: { number: 'INS-4410', expiresOn: inDays(12) } }) },
        { name: 'Hyundai Creta', image: '/cars/compact-suv.svg', category: 'suv', registrationNumber: 'UP65 KT 5521', capacity: 5, luggage: 3, fuelType: 'Diesel', transmission: 'Automatic', owner: company._id, documents: docs('5521') },
        { name: 'Maruti Ertiga', image: '/cars/mpv.svg', category: 'muv', registrationNumber: 'UP65 MT 6630', capacity: 6, luggage: 3, fuelType: 'CNG', transmission: 'Manual', owner: ganga._id, documents: docs('6630') },
        { name: 'Toyota Innova Crysta', image: '/cars/mpv.svg', category: 'muv', registrationNumber: 'UP65 NT 7745', capacity: 7, luggage: 4, fuelType: 'Diesel', transmission: 'Manual', owner: shiv._id, documents: docs('7745') },
    ]);
    await Car.create([
        // In the workshop: not offered to customers.
        { name: 'Mahindra XUV700', image: '/cars/suv.svg', category: 'suv', registrationNumber: 'UP65 PT 8850', capacity: 7, luggage: 4, fuelType: 'Diesel', transmission: 'Automatic', owner: company._id, maintenance: true, documents: docs('8850') },
        // PUC expired: blocked until renewed.
        { name: 'Toyota Etios', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: 'UP65 RT 9960', capacity: 4, luggage: 2, fuelType: 'Diesel', transmission: 'Manual', owner: ganga._id, documents: docs('9960', { puc: { number: 'PUC-9960', expiresOn: inDays(-3) } }) },
    ]);

    // ---------- Bookings in every state ----------
    const rates = await rentals.activeRates();
    const pkg = key => rentals.PACKAGES.find(item => item.key === key);

    async function rental({ user, car, driver, status, trip, extra = {} }) {
        const price = rentals.priceTrip(trip, rates[car.category], settings);
        const blockEnd = trip.blockEnd || new Date(trip.end.getTime() + settings.bufferMinutes * 60000);
        const booking = await Booking.create({
            type: 'rental',
            reference: await rentals.nextReference(),
            user: user._id,
            driver: driver?._id,
            car: car._id,
            status,
            rentalType: trip.rentalType,
            packageKey: trip.package?.key,
            airportDirection: trip.airportDirection,
            pickup: trip.pickup,
            drop: trip.drop,
            destination: trip.destination,
            start: trip.start,
            end: trip.end,
            blockEnd,
            totalHours: round((trip.end - trip.start) / HOUR, 1),
            distanceKm: trip.distanceKm,
            passengers: trip.passengers,
            driverRequired: true,
            rates: price.rates,
            totalAmount: price.total,
            fareBreakdown: price.breakdown,
            payment: { method: extra.paymentMethod || 'upi', status: 'unpaid', paid: 0, refunded: 0, due: price.total, refundDue: 0 },
            pin: String(1000 + Math.floor(Math.random() * 9000)),
            ...(driver ? { assignment: { assignedAt: new Date(trip.start.getTime() - 20 * HOUR), ...(extra.acknowledged ? { acknowledgedAt: new Date(trip.start.getTime() - 18 * HOUR) } : {}) } } : {}),
            ...extra.fields,
            timeline: extra.timeline || [{ status: 'pending_approval', by: 'customer', at: new Date(trip.start.getTime() - 2 * DAY) }],
        });
        if (rentals.OPEN_STATUSES.includes(status)) {
            await rentals.reserve('car', car._id, booking._id, trip.start, blockEnd);
            if (driver) await rentals.reserve('driver', driver._id, booking._id, trip.start, blockEnd);
        }
        return booking;
    }
    const step = (status, at, by, note) => ({ status, at, by, ...(note ? { note } : {}) });
    async function pay(booking, amount, method, by, kind = 'payment', reference) {
        await Payment.create({ booking: booking._id, kind, amount, method, reference, recordedBy: { id: by._id, role: by.adminRole ? 'admin' : 'driver', name: by.fullName } });
        await rentals.refreshPayment(booking._id);
    }

    // 1. New request waiting for approval (full day tomorrow).
    const tomorrow9 = fromNow(24);
    tomorrow9.setHours(9);
    await rental({
        user: asha, car: dzire, status: 'pending_approval',
        trip: { rentalType: 'full_day', package: pkg('8h80'), pickup: place('Lanka'), start: tomorrow9, end: new Date(tomorrow9.getTime() + 8 * HOUR), passengers: 3 },
        extra: { fields: { instructions: 'Temple visits: Kashi Vishwanath, Sankat Mochan, Durga Kund. Two senior citizens.' } },
    });

    // 2. Outstation round trip request (Prayagraj, 2 days).
    const prayagStart = fromNow(3 * 24);
    prayagStart.setHours(6);
    const prayagEnd = new Date(prayagStart.getTime() + 37 * HOUR);
    const prayagKm = roadKm(place('Varanasi Junction'), destination('prayagraj'));
    await rental({
        user: rohan, car: innova, status: 'pending_approval',
        trip: { rentalType: 'outstation_round', pickup: place('Varanasi Junction'), destination: destination('prayagraj'), distanceKm: prayagKm, start: prayagStart, end: prayagEnd, days: rentals.calendarDays(prayagStart, prayagEnd), nights: rentals.nightsBetween(prayagStart, prayagEnd), passengers: 6 },
        extra: { fields: { instructions: 'Family trip for Sangam snan. Need roof carrier for luggage.' } },
    });

    // 3. Confirmed airport drop, driver acknowledged, advance paid.
    const airportStart = fromNow(30);
    const airportKm = roadKm(place('Sigra'), rentals.AIRPORT);
    const airport = await rental({
        user: priya, car: creta, driver: ravi, status: 'confirmed',
        trip: { rentalType: 'airport', airportDirection: 'to_airport', pickup: place('Sigra'), drop: rentals.AIRPORT, distanceKm: airportKm, start: airportStart, end: new Date(airportStart.getTime() + 75 * 60000), passengers: 2 },
        extra: {
            acknowledged: true,
            timeline: [step('pending_approval', inDays(-1), 'customer'), step('confirmed', inDays(-0.9), 'admin', 'Car UP65 KT 5521 and driver Ravi Kumar assigned'), step('confirmed', inDays(-0.8), 'driver', 'Driver acknowledged the assignment')],
        },
    });
    await pay(airport, 500, 'upi', admins[1], 'payment', 'UPI-58201933');

    // 4. Confirmed one-way to Ayodhya; driver has NOT acknowledged yet (shows in "needs attention").
    const ayodhyaStart = fromNow(2 * 24);
    ayodhyaStart.setHours(7);
    const ayodhyaKm = roadKm(place('Assi'), destination('ayodhya'));
    const ayodhyaHours = ayodhyaKm / 45;
    await rental({
        user: vikram, car: ertiga, driver: sunil, status: 'confirmed',
        trip: { rentalType: 'outstation_oneway', pickup: place('Assi'), destination: destination('ayodhya'), distanceKm: ayodhyaKm, start: ayodhyaStart, end: new Date(ayodhyaStart.getTime() + ayodhyaHours * HOUR), blockEnd: new Date(ayodhyaStart.getTime() + (2 * ayodhyaHours + 1) * HOUR), days: 1, nights: 0, passengers: 5 },
        extra: { paymentMethod: 'cash', timeline: [step('pending_approval', inDays(-1), 'customer'), step('confirmed', inDays(-0.5), 'admin', 'Car UP65 MT 6630 and driver Sunil Yadav assigned')] },
    });

    // 5. Trip under way right now (hourly package, started an hour ago).
    const liveStart = fromNow(-1);
    await rental({
        user: rohan, car: swift, driver: imran, status: 'in_progress',
        trip: { rentalType: 'hourly', package: pkg('4h40'), pickup: place('Godowlia'), start: liveStart, end: new Date(liveStart.getTime() + 4 * HOUR), passengers: 2 },
        extra: {
            acknowledged: true,
            fields: { activeDriver: true, trip: { startOdometer: 41230, startedAt: new Date(liveStart.getTime() + 5 * 60000) } },
            timeline: [step('pending_approval', inDays(-2), 'customer'), step('confirmed', inDays(-1.8), 'admin'), step('arrived', new Date(liveStart.getTime() - 10 * 60000), 'driver'), step('in_progress', new Date(liveStart.getTime() + 5 * 60000), 'driver')],
        },
    });

    // 6. Completed full day with extra km, tolls, paid in full and rated.
    const doneStart = fromNow(-3 * 24);
    doneStart.setHours(8);
    const done = await rental({
        user: asha, car: city, driver: ravi, status: 'completed',
        trip: { rentalType: 'full_day', package: pkg('8h80'), pickup: place('Lanka'), drop: place('Sarnath'), start: doneStart, end: new Date(doneStart.getTime() + 8 * HOUR), passengers: 4 },
        extra: {
            acknowledged: true,
            fields: { trip: { startOdometer: 52010, endOdometer: 52106, startedAt: doneStart, endedAt: new Date(doneStart.getTime() + 8.5 * HOUR) }, ratingByCustomer: { score: 5, comment: 'Ravi ji was patient at every temple. Clean car.', at: new Date(doneStart.getTime() + 9 * HOUR) } },
            timeline: [step('pending_approval', inDays(-5), 'customer'), step('confirmed', inDays(-4.8), 'admin'), step('arrived', new Date(doneStart.getTime() - 10 * 60000), 'driver'), step('in_progress', doneStart, 'driver'), step('completed', new Date(doneStart.getTime() + 8.5 * HOUR), 'driver')],
        },
    });
    const doneBill = rentals.settle(done, { actualKm: 96, tolls: 60, parking: 50 }, new Date(doneStart.getTime() + 8.5 * HOUR));
    await Booking.updateOne({ _id: done._id }, { $set: { settlement: doneBill, finalAmount: done.totalAmount + doneBill.total } });
    await Driver.updateOne({ _id: ravi._id }, { $inc: { 'rating.total': 5, 'rating.count': 1 } });
    await pay(done, 1000, 'upi', admins[1], 'payment', 'UPI-47110022');
    await pay(done, done.totalAmount + doneBill.total - 1000, 'cash', ravi);

    // 7. Completed airport pickup, paid cash to the driver.
    const pickupStart = fromNow(-6 * 24);
    const pickupKm = roadKm(rentals.AIRPORT, place('Assi'));
    const pickup = await rental({
        user: vikram, car: dzire, driver: imran, status: 'completed',
        trip: { rentalType: 'airport', airportDirection: 'from_airport', pickup: rentals.AIRPORT, drop: place('Assi'), distanceKm: pickupKm, start: pickupStart, end: new Date(pickupStart.getTime() + 2 * HOUR), passengers: 1 },
        extra: {
            paymentMethod: 'cash',
            acknowledged: true,
            fields: { trip: { startOdometer: 30440, endOdometer: 30472, startedAt: pickupStart, endedAt: new Date(pickupStart.getTime() + 1.4 * HOUR) }, ratingByCustomer: { score: 4, comment: 'Flight was late, driver waited without fuss.', at: new Date(pickupStart.getTime() + 2 * HOUR) } },
            timeline: [step('pending_approval', inDays(-8), 'customer'), step('confirmed', inDays(-7.9), 'admin'), step('in_progress', pickupStart, 'driver'), step('completed', new Date(pickupStart.getTime() + 1.4 * HOUR), 'driver')],
        },
    });
    const pickupBill = rentals.settle(pickup, { actualKm: 32 }, new Date(pickupStart.getTime() + 1.4 * HOUR));
    await Booking.updateOne({ _id: pickup._id }, { $set: { settlement: pickupBill, finalAmount: pickup.totalAmount + pickupBill.total } });
    await Driver.updateOne({ _id: imran._id }, { $inc: { 'rating.total': 4, 'rating.count': 1 } });
    await pay(pickup, pickup.totalAmount + pickupBill.total, 'cash', imran);

    // 8. Cancelled by the customer 30 h before pickup: full refund still to be sent.
    const cancelledStart = fromNow(-1 * 24);
    const cancelled = await rental({
        user: priya, car: city, status: 'cancelled',
        trip: { rentalType: 'hourly', package: pkg('6h60'), pickup: place('Banaras'), start: cancelledStart, end: new Date(cancelledStart.getTime() + 6 * HOUR), passengers: 2 },
        extra: {
            fields: { cancellation: { by: 'customer', reason: 'Meeting moved to next week', at: new Date(cancelledStart.getTime() - 30 * HOUR), refundPercent: 100, charge: 0 } },
            timeline: [step('pending_approval', inDays(-4), 'customer'), step('confirmed', inDays(-3.5), 'admin'), step('cancelled', new Date(cancelledStart.getTime() - 30 * HOUR), 'customer', 'Meeting moved to next week')],
        },
    });
    await pay(cancelled, 600, 'upi', admins[1], 'payment', 'UPI-33019874');

    // 9. Rejected request, with the reason the customer sees.
    const rejectedStart = fromNow(5 * 24);
    await rental({
        user: vikram, car: innova, status: 'rejected',
        trip: { rentalType: 'outstation_oneway', pickup: place('Sigra'), destination: destination('patna'), distanceKm: roadKm(place('Sigra'), destination('patna')), start: rejectedStart, end: new Date(rejectedStart.getTime() + 6 * HOUR), days: 1, nights: 0, passengers: 7 },
        extra: {
            fields: { rejection: { reason: 'No 7-seater with a valid Bihar permit on that date. Please try a sedan or another date.', at: inDays(-0.2) } },
            timeline: [step('pending_approval', inDays(-0.5), 'customer'), step('rejected', inDays(-0.2), 'admin', 'No 7-seater with a valid Bihar permit on that date.')],
        },
    });

    await Feedback.create([
        { appRating: 5, additionalComments: 'Booking a car with driver for the whole day was simple. Loved the price breakdown.', userId: asha._id },
        { appRating: 4, additionalComments: 'Would like to pay online by card too.', userId: vikram._id },
    ]);

    console.log(`Seeded synthetic demo data. Password for every demo account: ${DEMO_PASSWORD}
  admins     -> admin (super), ops (operations), support (support)   [sign in at /admin/login]
  customers  -> asha, rohan, priya, vikram
  chauffeurs -> ravi, sunil, imran (licence expiring soon), manoj (police verification pending), deepak (application pending)
  fleet      -> 8 cars (1 in maintenance, 1 with expired PUC, 1 with insurance due), 3 owners
  bookings   -> 9 bookings in every state: requests waiting, confirmed, live, completed, cancelled, rejected`);
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
