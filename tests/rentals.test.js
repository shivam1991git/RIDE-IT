// Chauffeur rental flow: search → request → admin approval + assignment →
// driver trip → final bill, plus policies, payments, roles and edge cases.
const h = require('./helpers');
const { config } = require('../src/config');
const { Booking } = require('../src/models/Booking');
const { Notification } = require('../src/models/misc');
const { Settings } = require('../src/models/rental');
const Car = require('../src/models/Car');
const { Driver } = require('../src/models/accounts');
const rentals = require('../src/services/rentals');
const { rejectUnconfirmedRentals } = require('../src/services/bookings');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

const HOUR = 3600 * 1000;
const at = hours => new Date(Date.now() + hours * HOUR).toISOString();
const { assi, station, delhi } = h.PLACES;

const hourly = (overrides = {}) => ({ rentalType: 'hourly', packageKey: '4h40', pickup: assi, start: at(26), passengers: 2, ...overrides });

async function book(agent, car, overrides = {}, status = 201) {
    const res = await agent.post('/api/rentals').send({ ...hourly(), carId: car._id.toString(), paymentMethod: 'upi', ...overrides });
    if (res.status !== status) throw new Error(`book: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.booking;
}

// Customer request approved by operations with a chauffeur.
async function confirmedTrip(overrides = {}) {
    const [rider, admin, driver, car] = await Promise.all([h.customer(), h.admin(), h.chauffeur(), h.fleetCar()]);
    const booking = await book(rider, car, overrides);
    const approved = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(200);
    return { rider, admin, driver, car, booking: approved.body.booking };
}

describe('catalogue and search', () => {
    test('options list every rental type, package, destination and policy', async () => {
        const res = await h.request().get('/api/rentals/options').expect(200);
        expect(res.body.types.map(t => t.key)).toEqual(['hourly', 'full_day', 'outstation_oneway', 'outstation_round', 'airport']);
        expect(res.body.packages.map(p => p.key)).toEqual(['4h40', '6h60', '8h80', '12h120']);
        expect(res.body.destinations.length).toBeGreaterThanOrEqual(6);
        expect(res.body.classes.find(c => c.vehicleClass === 'sedan').fromPrice).toBe(1199);
        expect(res.body.policy.cancellation).toMatchObject({ freeHours: 24, partialHours: 6, partialRefundPercent: 50 });
    });

    test('search prices every car server-side and explains why some cannot go', async () => {
        const good = await h.fleetCar();
        const small = await h.fleetCar({ name: 'Swift', category: 'hatchback', capacity: 4 });
        const expired = await h.fleetCar({ name: 'Old Ertiga', category: 'muv', capacity: 7 });
        await Car.updateOne({ _id: expired._id }, { $set: { 'documents.insurance.expiresOn': h.inDays(-1) } });
        await h.fleetCar({ name: 'In garage', maintenance: true });

        const res = await h.request().post('/api/rentals/search').send(hourly({ passengers: 4 })).expect(200);
        const byName = Object.fromEntries(res.body.cars.map(row => [row.car.name, row]));
        // Sedan 4 h / 40 km = ₹1199 + 5% GST (₹60).
        expect(byName['Honda City'].fare.total).toBe(1259);
        expect(byName['Honda City'].fare.rates).toMatchObject({ includedKm: 40, includedHours: 4, extraKmRate: 13, extraHourRate: 150 });
        expect(byName.Swift).toMatchObject({ available: true });
        expect(byName['Old Ertiga']).toMatchObject({ available: false, reason: 'Not available for these dates' });
        expect(byName['In garage'].available).toBe(false);
        // Compliance documents and owners never leave the server.
        for (const row of res.body.cars) {
            expect(row.car.documents).toBeUndefined();
            expect(row.car.slots).toBeUndefined();
        }
        // Available cars are listed first, cheapest first.
        expect(res.body.cars[0].car.name).toBe('Swift');
        expect(good).toBeTruthy();
        expect(small).toBeTruthy();
    });

    test('search marks cars that seat too few passengers', async () => {
        await h.fleetCar({ capacity: 4 });
        const res = await h.request().post('/api/rentals/search').send(hourly({ passengers: 6 })).expect(200);
        expect(res.body.cars[0]).toMatchObject({ available: false, reason: 'Seats 4' });
    });

    test.each([
        ['pickup outside the service area', hourly({ pickup: delhi }), /outside our Varanasi service area/],
        ['pickup too soon', hourly({ start: at(1) }), /at least 2 hours/],
        ['pickup too far ahead', hourly({ start: at(24 * 40) }), /up to 30 days ahead/],
        ['a full-day package on an hourly booking', hourly({ packageKey: '8h80' }), /hourly package/],
        ['an unknown package', hourly({ packageKey: '99h' }), /hourly package/],
        ['no passengers', hourly({ passengers: 0 }), /At least 1 passenger/],
        ['a missing pickup', hourly({ pickup: undefined }), /Pickup address is required/],
        ['an unknown destination', { rentalType: 'outstation_oneway', destinationKey: 'goa', pickup: assi, start: at(26), passengers: 2 }, /destination city/],
        ['a round trip without a return time', { rentalType: 'outstation_round', destinationKey: 'prayagraj', pickup: assi, start: at(26), passengers: 2 }, /Return date and time is required/],
        ['a round trip returning too early', { rentalType: 'outstation_round', destinationKey: 'prayagraj', pickup: assi, start: at(26), returnAt: at(28), passengers: 2 }, /Return must be after/],
        ['a round trip longer than 7 days', { rentalType: 'outstation_round', destinationKey: 'prayagraj', pickup: assi, start: at(26), returnAt: at(26 + 24 * 9), passengers: 2 }, /at most 7 days/],
        ['an airport transfer from the airport itself', { rentalType: 'airport', airportDirection: 'to_airport', pickup: { name: 'Airport', lat: 25.4525, lng: 82.8594 }, start: at(26), passengers: 1 }, /at the airport itself/],
        ['an airport transfer without a direction', { rentalType: 'airport', pickup: assi, start: at(26), passengers: 1 }, /from or drop to the airport/],
        ['a bad date', hourly({ start: 'tomorrow' }), /valid date/],
    ])('rejects %s', async (name, body, message) => {
        const res = await h.request().post('/api/rentals/search').send(body).expect(400);
        expect(res.body.error.message).toMatch(message);
    });

    test('outstation one-way charges the minimum distance, allowance and GST', async () => {
        await h.fleetCar();
        const res = await h.request().post('/api/rentals/search').send({ rentalType: 'outstation_oneway', destinationKey: 'vindhyachal', pickup: station, start: at(30), passengers: 3 }).expect(200);
        const { fare } = res.body.cars[0];
        // Vindhyachal is closer than 130 km, so the one-way minimum applies.
        expect(fare.breakdown[0]).toEqual({ label: 'Distance 130 km × ₹13 (minimum 130 km)', amount: 1690 });
        expect(fare.breakdown[1].label).toMatch(/Driver allowance \(1 day × ₹300\)/);
        const subtotal = fare.breakdown.filter(line => !line.label.startsWith('GST')).reduce((sum, line) => sum + line.amount, 0);
        expect(fare.total).toBe(subtotal + Math.round(subtotal * 0.05));
        expect(fare.rates.extraHourRate).toBe(0);
    });

    test('outstation round trip uses the per-day minimum and charges nights', async () => {
        await h.fleetCar();
        const start = new Date(Date.now() + 30 * HOUR);
        const returnAt = new Date(start.getTime() + 2 * 24 * HOUR);
        const res = await h.request().post('/api/rentals/search').send({ rentalType: 'outstation_round', destinationKey: 'prayagraj', pickup: station, start: start.toISOString(), returnAt: returnAt.toISOString(), passengers: 3 }).expect(200);
        const { trip, cars } = res.body;
        expect(trip.days).toBe(3);
        expect(trip.nights).toBe(2);
        const labels = cars[0].fare.breakdown.map(line => line.label);
        expect(labels[0]).toBe('Distance 750 km × ₹13 (minimum 250 km/day × 3 days)');
        expect(labels).toContain('Night charges (2 × ₹250)');
    });

    test('airport pickup includes free waiting and charges extra distance upfront', async () => {
        await h.fleetCar();
        const res = await h.request().post('/api/rentals/search').send({ rentalType: 'airport', airportDirection: 'from_airport', drop: { name: 'Ramnagar', lat: 25.2694, lng: 83.0255 }, start: at(30), passengers: 2 }).expect(200);
        const { trip, cars } = res.body;
        expect(trip.pickup.name).toMatch(/Airport/);
        expect(cars[0].fare.inclusions).toContain('30 min free waiting for your flight');
        expect(cars[0].fare.breakdown[1].label).toMatch(/^Extra distance \(\d+ km × ₹13\)$/);
    });
});

describe('booking requests', () => {
    test('a request waits for approval with a reference, PIN, rate snapshot and admin alert', async () => {
        const admin = await h.admin();
        const ops = await h.admin('operations');
        const support = await h.admin('support');
        const rider = await h.customer();
        const car = await h.fleetCar();
        const booking = await book(rider, car, { instructions: 'Two suitcases' });
        expect(booking).toMatchObject({ status: 'pending_approval', rentalType: 'hourly', packageKey: '4h40', totalAmount: 1259, instructions: 'Two suitcases', passengers: 2 });
        expect(booking.reference).toMatch(/^BK\d{4}$/);
        expect(booking.pin).toMatch(/^\d{4}$/);
        expect(booking.payment).toMatchObject({ method: 'upi', status: 'unpaid', due: 1259 });
        expect(booking.rates).toMatchObject({ vehicleClass: 'sedan', includedKm: 40, gstPercent: 5 });
        const alerts = await Notification.find({ type: 'booking.request' }).lean();
        const recipients = alerts.map(n => n.recipient.toString());
        expect(recipients).toEqual(expect.arrayContaining([admin.doc._id.toString(), ops.doc._id.toString()]));
        expect(recipients).not.toContain(support.doc._id.toString());
    });

    test('references are unique and sequential', async () => {
        const rider = await h.customer();
        const first = await book(rider, await h.fleetCar(), { start: at(26) });
        const second = await book(rider, await h.fleetCar(), { start: at(40) });
        expect(Number(second.reference.slice(2))).toBe(Number(first.reference.slice(2)) + 1);
    });

    test('the same car cannot be double-booked, even by simultaneous requests', async () => {
        const car = await h.fleetCar();
        const riders = await Promise.all([h.customer(), h.customer(), h.customer()]);
        const results = await Promise.all(riders.map(rider => rider.post('/api/rentals').send({ ...hourly(), carId: car._id.toString() })));
        const codes = results.map(r => r.status).sort();
        expect(codes).toEqual([201, 409, 409]);
        expect(results.find(r => r.status === 409).body.error.code).toBe('slot_taken');
        // Overlap includes the 60 min turnaround buffer after the 4 h package.
        const other = await h.customer();
        await other.post('/api/rentals').send({ ...hourly({ start: at(26 + 4.5) }), carId: car._id.toString() }).expect(409);
        await other.post('/api/rentals').send({ ...hourly({ start: at(26 + 5) }), carId: car._id.toString() }).expect(201);
    });

    test('a customer cannot submit overlapping or too many requests', async () => {
        const rider = await h.customer();
        await book(rider, await h.fleetCar());
        const dup = await rider.post('/api/rentals').send({ ...hourly({ start: at(27) }), carId: (await h.fleetCar())._id.toString() }).expect(409);
        expect(dup.body.error.code).toBe('duplicate_booking');
        for (let i = 1; i < 5; i += 1) await book(rider, await h.fleetCar(), { start: at(26 + i * 10) });
        const tooMany = await rider.post('/api/rentals').send({ ...hourly({ start: at(200) }), carId: (await h.fleetCar())._id.toString() }).expect(409);
        expect(tooMany.body.error.code).toBe('too_many_pending');
    });

    test('a car that seats too few or has expired papers cannot be requested', async () => {
        const rider = await h.customer();
        const small = await h.fleetCar({ capacity: 4 });
        await book(rider, small, { passengers: 6 }, 400);
        const expiring = await h.fleetCar();
        await Car.updateOne({ _id: expiring._id }, { $set: { 'documents.permit.expiresOn': new Date(Date.now() + 27 * HOUR) } });
        const res = await rider.post('/api/rentals').send({ ...hourly(), carId: expiring._id.toString() }).expect(409);
        expect(res.body.error.code).toBe('unavailable');
    });

    test('only customers can request rentals', async () => {
        const driver = await h.chauffeur();
        await driver.post('/api/rentals').send({}).expect(403);
        await h.request().post('/api/rentals').send({}).expect(401);
    });
});

describe('approval and assignment', () => {
    test('approval assigns a compliant driver and shows the customer their chauffeur', async () => {
        const { rider, driver, booking, car } = await confirmedTrip();
        expect(booking.status).toBe('confirmed');
        expect(booking.driver._id).toBe(driver.doc._id.toString());
        const seen = await rider.get(`/api/bookings/${booking._id}`).expect(200);
        expect(seen.body.booking.driver).toMatchObject({ fullName: 'Ravi Kumar', phoneNumber: '9123456780' });
        expect(seen.body.booking.car.registrationNumber).toBe(car.registrationNumber);
        expect(seen.body.booking.assignment.declines).toBeUndefined();
        const driverNote = await Notification.findOne({ recipient: driver.doc._id, type: 'assignment.new' }).lean();
        expect(driverNote.title).toMatch(/^New trip BK/);
    });

    test('approval needs a driver, and the driver must be compliant and free', async () => {
        const [rider, admin, car] = await Promise.all([h.customer(), h.admin(), h.fleetCar()]);
        const booking = await book(rider, car);
        await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({}).expect(400);

        const expiredLicence = await h.chauffeur({ compliance: { licenseExpiry: h.inDays(-2) } });
        let res = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: expiredLicence.doc._id.toString() }).expect(409);
        expect(res.body.error.message).toMatch(/Driving licence expires/);

        const unverified = await h.chauffeur({ compliance: { policeVerification: { status: 'pending' } } });
        res = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: unverified.doc._id.toString() }).expect(409);
        expect(res.body.error.message).toMatch(/Police verification/);

        // A driver already on an overlapping trip is refused.
        const busy = await h.chauffeur();
        const other = await book(await h.customer(), await h.fleetCar(), { start: at(27) });
        await admin.post(`/api/admin/bookings/${other._id}/approve`).send({ driverId: busy.doc._id.toString() }).expect(200);
        res = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: busy.doc._id.toString() }).expect(409);
        expect(res.body.error.code).toBe('driver_busy');

        // Candidates explain all of this before the admin picks.
        const candidates = await admin.get(`/api/admin/bookings/${booking._id}/candidates`).expect(200);
        const byId = Object.fromEntries(candidates.body.drivers.map(d => [d._id, d]));
        expect(byId[busy.doc._id.toString()]).toMatchObject({ available: false, issue: 'Has another trip at this time' });
        expect(byId[unverified.doc._id.toString()].available).toBe(false);
        expect(candidates.body.cars.find(c => c.current)).toMatchObject({ available: true });
    });

    test('a car whose papers lapse after the request must be changed before approval', async () => {
        const [rider, admin, driver, car] = await Promise.all([h.customer(), h.admin(), h.chauffeur(), h.fleetCar()]);
        const booking = await book(rider, car);
        await Car.updateOne({ _id: car._id }, { $set: { 'documents.puc.expiresOn': h.inDays(-1) } });
        const res = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(409);
        expect(res.body.error.code).toBe('car_not_compliant');
        // The driver lock was rolled back.
        expect((await Driver.findById(driver.doc._id).select('+slots').lean()).slots.filter(s => s.active)).toHaveLength(0);
        const replacement = await h.fleetCar({ name: 'Dzire' });
        const ok = await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: driver.doc._id.toString(), carId: replacement._id.toString() }).expect(200);
        expect(ok.body.booking.car.name).toBe('Dzire');
        // The original car is free again.
        expect((await Car.findById(car._id).select('+slots').lean()).slots.every(s => !s.active)).toBe(true);
    });

    test('two admins approving at once cannot double-assign', async () => {
        const [rider, admin, car] = await Promise.all([h.customer(), h.admin(), h.fleetCar()]);
        const [d1, d2] = await Promise.all([h.chauffeur(), h.chauffeur()]);
        const booking = await book(rider, car);
        const results = await Promise.all([d1, d2].map(d => admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: d.doc._id.toString() })));
        expect(results.map(r => r.status).sort()).toEqual([200, 409]);
        // The losing driver is not left holding a reservation.
        const loser = results[0].status === 409 ? d1 : d2;
        expect((await Driver.findById(loser.doc._id).select('+slots').lean()).slots.filter(s => s.active)).toHaveLength(0);
    });

    test('rejecting needs a reason, tells the customer and frees the car', async () => {
        const [rider, admin, car] = await Promise.all([h.customer(), h.admin(), h.fleetCar()]);
        const booking = await book(rider, car);
        await admin.post(`/api/admin/bookings/${booking._id}/reject`).send({ reason: 'no' }).expect(400);
        const res = await admin.post(`/api/admin/bookings/${booking._id}/reject`).send({ reason: 'No chauffeur available that morning' }).expect(200);
        expect(res.body.booking).toMatchObject({ status: 'rejected', rejection: { reason: 'No chauffeur available that morning' } });
        const note = await Notification.findOne({ recipient: rider.account._id, type: 'booking.rejected' }).lean();
        expect(note.body).toMatch(/No chauffeur available that morning/);
        await book(await h.customer(), car);
        await admin.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: (await h.chauffeur()).doc._id.toString() }).expect(409);
    });

    test('a driver can be replaced before arrival; the old one is released and told', async () => {
        const { admin, driver, booking } = await confirmedTrip();
        const next = await h.chauffeur();
        await admin.post(`/api/admin/bookings/${booking._id}/assign-driver`).send({ driverId: driver.doc._id.toString() }).expect(400);
        const res = await admin.post(`/api/admin/bookings/${booking._id}/assign-driver`).send({ driverId: next.doc._id.toString() }).expect(200);
        expect(res.body.booking.driver._id).toBe(next.doc._id.toString());
        expect(res.body.booking.assignment.acknowledgedAt).toBeUndefined();
        expect(await Notification.exists({ recipient: driver.doc._id, type: 'assignment.removed' })).toBeTruthy();
        expect((await Driver.findById(driver.doc._id).select('+slots').lean()).slots.filter(s => s.active)).toHaveLength(0);
    });

    test('changing the car keeps the agreed price and checks the new car', async () => {
        const { admin, booking, rider } = await confirmedTrip();
        const expired = await h.fleetCar({ name: 'Expired' });
        await Car.updateOne({ _id: expired._id }, { $set: { 'documents.fitness.expiresOn': h.inDays(-1) } });
        await admin.post(`/api/admin/bookings/${booking._id}/change-car`).send({ carId: expired._id.toString() }).expect(409);
        const upgrade = await h.fleetCar({ name: 'Innova Crysta', category: 'muv', capacity: 7 });
        const res = await admin.post(`/api/admin/bookings/${booking._id}/change-car`).send({ carId: upgrade._id.toString() }).expect(200);
        expect(res.body.booking).toMatchObject({ totalAmount: booking.totalAmount, car: { name: 'Innova Crysta' } });
        expect(await Notification.exists({ recipient: rider.account._id, type: 'booking.car' })).toBeTruthy();
    });
});

describe('the chauffeur trip', () => {
    test('assignments, acknowledgement, PIN start with odometer, and the final bill', async () => {
        const { rider, driver, booking } = await confirmedTrip({ start: at(2.5) });
        const list = await driver.get('/api/driver/assignments').expect(200);
        expect(list.body.upcoming.map(b => b._id)).toEqual([booking._id]);
        expect(list.body.upcoming[0].user.phoneNumber).toBe('9876543210');

        await driver.post(`/api/driver/bookings/${booking._id}/acknowledge`).expect(200);
        await driver.post(`/api/driver/bookings/${booking._id}/acknowledge`).expect(409);
        await driver.post(`/api/driver/bookings/${booking._id}/arrive`).expect(200);

        const pin = (await rider.get(`/api/bookings/${booking._id}`)).body.booking.pin;
        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin }).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin: pin === '0000' ? '1111' : '0000', startOdometer: 25000 }).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin, startOdometer: 25000 }).expect(200);
        // Customers can no longer cancel once the trip is under way.
        await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(409);

        await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({ endOdometer: 24000 }).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({}).expect(400);
        const done = await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({ endOdometer: 25052, tolls: 80, parking: 40, collected: { amount: 1000, method: 'cash' } }).expect(200);
        // 52 km driven, 40 included: 12 × ₹13 = ₹156, GST ₹8, tolls and parking at actuals.
        expect(done.body.booking.settlement).toMatchObject({ actualKm: 52, extraKm: 12, extraKmCharge: 156, extraHours: 0, gst: 8, tolls: 80, parking: 40, total: 284 });
        expect(done.body.booking.finalAmount).toBe(1259 + 284);

        const seen = (await rider.get(`/api/bookings/${booking._id}`)).body.booking;
        expect(seen.status).toBe('completed');
        expect(seen.pin).toBeUndefined();
        expect(seen.payment).toMatchObject({ paid: 1000, due: 1543, status: 'partially_paid' });

        await rider.post(`/api/bookings/${booking._id}/rate`).send({ score: 5, comment: 'Very polite' }).expect(200);
        const summary = await driver.get('/api/driver/summary').expect(200);
        expect(summary.body.stats.earnings).toBe(1543);
    });

    test('arriving is only possible close to pickup, and one active trip at a time', async () => {
        const { driver, booking } = await confirmedTrip({ start: at(26) });
        const early = await driver.post(`/api/driver/bookings/${booking._id}/arrive`).expect(400);
        expect(early.body.error.message).toMatch(/3 hours before pickup/);

        // A driver cannot be at two pickups at once (the second trip is far enough apart to be assignable).
        const admin = await h.admin();
        const first = await book(await h.customer(), await h.fleetCar(), { start: at(2.2) });
        const second = await book(await h.customer(), await h.fleetCar(), { start: at(2.2 + 5.1) });
        await admin.post(`/api/admin/bookings/${first._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(200);
        await admin.post(`/api/admin/bookings/${second._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(200);
        await Booking.updateOne({ _id: second._id }, { $set: { start: new Date(Date.now() + HOUR) } });
        await driver.post(`/api/driver/bookings/${first._id}/arrive`).expect(200);
        const res = await driver.post(`/api/driver/bookings/${second._id}/arrive`).expect(409);
        expect(res.body.error.code).toBe('already_active');
    });

    test('declining releases the driver and alerts operations', async () => {
        const { driver, booking, admin } = await confirmedTrip();
        await driver.post(`/api/driver/bookings/${booking._id}/decline`).send({ reason: 'x' }).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/decline`).send({ reason: 'Family emergency' }).expect(200);
        const detail = await admin.get(`/api/admin/bookings/${booking._id}`).expect(200);
        expect(detail.body.booking.driver).toBeUndefined();
        expect(detail.body.booking.assignment.declines[0]).toMatchObject({ reason: 'Family emergency' });
        expect(await Notification.exists({ recipient: admin.doc._id, title: `${booking.reference}: driver needed` })).toBeTruthy();
        const view = await admin.get('/api/admin/bookings?view=needs_driver').expect(200);
        expect(view.body.items.map(b => b._id)).toContain(booking._id);
        // The declined trip is gone from the driver's list and they can no longer act on it.
        expect((await driver.get('/api/driver/assignments')).body.upcoming).toHaveLength(0);
        await driver.post(`/api/driver/bookings/${booking._id}/acknowledge`).expect(404);
    });

    test('drivers only see their own trips and can report issues on them', async () => {
        const { booking, driver } = await confirmedTrip();
        const stranger = await h.chauffeur();
        await stranger.get(`/api/bookings/${booking._id}`).expect(404);
        await stranger.post(`/api/driver/bookings/${booking._id}/acknowledge`).expect(404);
        await stranger.post(`/api/driver/bookings/${booking._id}/issue`).send({ category: 'breakdown', message: 'Flat tyre on the highway' }).expect(404);
        const res = await driver.post(`/api/driver/bookings/${booking._id}/issue`).send({ category: 'breakdown', message: 'Flat tyre on the highway' }).expect(201);
        const admin = await h.admin();
        const tickets = await admin.get('/api/admin/support').expect(200);
        expect(tickets.body.items[0]).toMatchObject({ _id: res.body.ticketId, priority: 'urgent', source: 'trip_issue' });
    });

    test('instant-ride endpoints are hidden from chauffeurs', async () => {
        const { booking, driver } = await confirmedTrip();
        const requests = await driver.get('/api/driver/requests').expect(200);
        expect(requests.body.rentals).toEqual([]);
        config.ridesEnabled = false;
        try {
            await driver.post(`/api/driver/bookings/${booking._id}/accept`).expect(404);
        } finally {
            config.ridesEnabled = true;
        }
    });
});

describe('cancellation policy and payments', () => {
    function pay(admin, booking, amount, kind = 'payment') {
        return admin.post(`/api/admin/bookings/${booking._id}/payments`).send({ kind, amount, method: 'upi', reference: 'UPI123' });
    }

    test('cancelling before approval is always free', async () => {
        const rider = await h.customer();
        const booking = await book(rider, await h.fleetCar());
        const terms = await rider.get(`/api/rentals/${booking._id}/cancel-terms`).expect(200);
        expect(terms.body.terms).toMatchObject({ refundPercent: 100, rule: 'not_confirmed', charge: 0 });
        const res = await rider.post(`/api/bookings/${booking._id}/cancel`).send({ reason: 'Plans changed' }).expect(200);
        expect(res.body.booking.cancellation).toMatchObject({ refundPercent: 100, charge: 0, by: 'customer' });
    });

    test.each([
        ['more than 24 h before pickup', 100, 30, 0],
        ['between 6 and 24 h before pickup', 50, 12, 630],
        ['less than 6 h before pickup', 0, 3, 1000],
    ])('a confirmed trip cancelled %s refunds %i%% of the policy share', async (label, refundPercent, hoursAhead, charge) => {
        const { rider, admin, booking } = await confirmedTrip({ start: at(40) });
        await pay(admin, booking, 1000).expect(200);
        await Booking.updateOne({ _id: booking._id }, { $set: { start: new Date(Date.now() + hoursAhead * HOUR) } });
        const terms = (await rider.get(`/api/rentals/${booking._id}/cancel-terms`).expect(200)).body.terms;
        // 50% of the ₹1259 fare is ₹630, capped at what was actually paid.
        expect(terms).toMatchObject({ refundPercent, charge, paid: 1000, refund: 1000 - charge });
        const res = await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(200);
        expect(res.body.booking.cancellation).toMatchObject({ refundPercent, charge });
        const expected = charge === 1000 ? 'paid' : 'refund_pending';
        expect(res.body.booking.payment).toMatchObject({ status: expected, refundDue: 1000 - charge });
    });

    test('the charge is never more than what was paid', async () => {
        const { rider, booking } = await confirmedTrip({ start: at(40) });
        await Booking.updateOne({ _id: booking._id }, { $set: { start: new Date(Date.now() + 3 * HOUR) } });
        const res = await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(200);
        expect(res.body.booking.cancellation).toMatchObject({ refundPercent: 0, charge: 0 });
        expect(res.body.booking.payment.status).toBe('unpaid');
    });

    test('refunds are tracked until settled, and cannot exceed the amount paid', async () => {
        const { rider, admin, booking } = await confirmedTrip();
        let res = await pay(admin, booking, 500).expect(200);
        expect(res.body.booking.payment).toMatchObject({ status: 'advance_paid', paid: 500 });
        res = await pay(admin, booking, 759).expect(200);
        expect(res.body.booking.payment.status).toBe('paid');
        await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(200);
        await pay(admin, booking, 2000, 'refund').expect(400);
        await pay(admin, booking, 100).expect(400);
        res = await pay(admin, booking, 600, 'refund').expect(200);
        expect(res.body.booking.payment).toMatchObject({ status: 'partially_refunded', refundDue: 659 });
        res = await pay(admin, booking, 659, 'refund').expect(200);
        expect(res.body.booking.payment).toMatchObject({ status: 'refunded', refundDue: 0 });
        expect(res.body.payments).toHaveLength(4);
        const customerNotes = await Notification.find({ recipient: rider.account._id, type: /^payment\./ }).lean();
        expect(customerNotes).toHaveLength(4);
    });

    test('admins must give a reason, and explicitly confirm cancelling an active trip', async () => {
        const { admin, driver, booking } = await confirmedTrip({ start: at(2.5) });
        await admin.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/arrive`).expect(200);
        const res = await admin.post(`/api/bookings/${booking._id}/cancel`).send({ reason: 'Customer did not show up' }).expect(409);
        expect(res.body.error.code).toBe('confirm_required');
        const ok = await admin.post(`/api/bookings/${booking._id}/cancel`).send({ reason: 'Customer did not show up', refundPercent: 0, confirmActive: true }).expect(200);
        expect(ok.body.booking).toMatchObject({ status: 'cancelled', cancellation: { refundPercent: 0, by: 'admin' } });
        // The driver is free for other trips again.
        const summary = await driver.get('/api/driver/summary').expect(200);
        expect(summary.body.activeBookingId).toBeNull();
    });
});

describe('rescheduling', () => {
    test('customers can move a pending request when the car is free', async () => {
        const rider = await h.customer();
        const car = await h.fleetCar();
        const booking = await book(rider, car);
        await book(await h.customer(), car, { start: at(50) });
        const clash = await rider.post(`/api/rentals/${booking._id}/reschedule`).send({ start: at(51) }).expect(409);
        expect(clash.body.error.code).toBe('slot_taken');
        await rider.post(`/api/rentals/${booking._id}/reschedule`).send({ start: at(1) }).expect(400);
        const res = await rider.post(`/api/rentals/${booking._id}/reschedule`).send({ start: at(60) }).expect(200);
        expect(new Date(res.body.booking.end) - new Date(res.body.booking.start)).toBe(4 * HOUR);
        expect(res.body.booking.timeline.at(-1).note).toMatch(/^Rescheduled to/);
    });

    test('a move the assigned driver cannot make is refused and nothing changes', async () => {
        const { admin, driver, booking } = await confirmedTrip();
        const other = await book(await h.customer(), await h.fleetCar(), { start: at(60) });
        await admin.post(`/api/admin/bookings/${other._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(200);
        const res = await admin.post(`/api/admin/bookings/${booking._id}/reschedule`).send({ start: at(61) }).expect(409);
        expect(res.body.error.code).toBe('driver_busy');
        const car = await Car.findById(booking.car._id).select('+slots').lean();
        const slot = car.slots.find(s => s.active && s.booking.toString() === booking._id);
        expect(slot.start.toISOString()).toBe(new Date(booking.start).toISOString());
    });

    test('other customers cannot touch someone else\'s booking', async () => {
        const booking = await book(await h.customer(), await h.fleetCar());
        const stranger = await h.customer();
        await stranger.post(`/api/rentals/${booking._id}/reschedule`).send({ start: at(60) }).expect(404);
        await stranger.get(`/api/rentals/${booking._id}/cancel-terms`).expect(404);
        await stranger.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(403);
    });
});

describe('admin roles and settings', () => {
    test('support can read but not act; operations cannot change pricing or the team', async () => {
        const rider = await h.customer();
        const booking = await book(rider, await h.fleetCar());
        const driver = await h.chauffeur();
        const support = await h.admin('support');
        const ops = await h.admin('operations');

        await support.get('/api/admin/bookings').expect(200);
        await support.get('/api/admin/stats').expect(200);
        await support.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(403);
        await support.post(`/api/bookings/${booking._id}/cancel`).send({ reason: 'test cancel' }).expect(403);
        await support.post('/api/admin/cars').send({}).expect(403);
        await support.get('/api/admin/admins').expect(403);

        await ops.patch('/api/admin/rates/sedan').send({ extraKmRate: 1 }).expect(403);
        await ops.patch('/api/admin/settings').send({ gstPercent: 0 }).expect(403);
        await ops.get('/api/admin/audit').expect(403);
        await ops.post('/api/admin/admins').send({}).expect(403);
        await ops.post(`/api/admin/bookings/${booking._id}/approve`).send({ driverId: driver.doc._id.toString() }).expect(200);
    });

    test('a role change applies immediately, and the last super admin is protected', async () => {
        const owner = await h.admin();
        const ops = await h.admin('operations');
        await owner.patch(`/api/admin/admins/${owner.doc._id}`).send({ adminRole: 'support' }).expect(400);
        await owner.patch(`/api/admin/admins/${ops.doc._id}`).send({ adminRole: 'support' }).expect(200);
        // The old session was revoked by the role change.
        await ops.get('/api/admin/bookings').expect(401);

        const second = await h.admin();
        await second.patch(`/api/admin/admins/${owner.doc._id}`).send({ adminRole: 'operations' }).expect(200);
        // Now `second` is the only super admin left.
        const res = await second.delete(`/api/admin/admins/${second.doc._id}`).expect(400);
        expect(res.body.error.message).toMatch(/your own/);
        const created = await second.post('/api/admin/admins').send({ fullName: 'New Ops', username: 'newops', email: 'newops@example.test', phoneNumber: '9000000002', password: 'Passw0rd!', adminRole: 'operations' }).expect(201);
        expect(created.body.item.adminRole).toBe('operations');
    });

    test('rate changes affect new quotes only; existing bookings keep their price', async () => {
        const admin = await h.admin();
        const rider = await h.customer();
        const car = await h.fleetCar();
        const booking = await book(rider, car);
        await admin.patch('/api/admin/rates/sedan').send({ packages: [{ key: '4h40', price: 2000 }] }).expect(200);
        const rates = await admin.get('/api/admin/rates').expect(200);
        const sedan = rates.body.items.find(r => r.vehicleClass === 'sedan');
        // Only the edited package changed.
        expect(sedan.packages.find(p => p.key === '8h80').price).toBe(2099);
        const quote = await h.request().post('/api/rentals/search').send(hourly({ start: at(80) })).expect(200);
        expect(quote.body.cars[0].fare.total).toBe(2100);
        expect((await rider.get(`/api/bookings/${booking._id}`)).body.booking.totalAmount).toBe(1259);
    });

    test('settings are validated and drive the policy', async () => {
        const admin = await h.admin();
        await admin.patch('/api/admin/settings').send({ cancellation: { partialHours: 30 } }).expect(400);
        await admin.patch('/api/admin/settings').send({ upiId: 'not a upi' }).expect(400);
        await admin.patch('/api/admin/settings').send({ minLeadHours: 6, upiId: 'rideit@okaxis', gstPercent: 12 }).expect(200);
        const options = await h.request().get('/api/rentals/options').expect(200);
        expect(options.body.contact.upiId).toBe('rideit@okaxis');
        await h.request().post('/api/rentals/search').send(hourly({ start: at(4) })).expect(400);
        await Settings.deleteMany({});
    });

    test('cars: document fields are merged, registration numbers validated and unique', async () => {
        const admin = await h.admin();
        const car = await h.fleetCar();
        await admin.patch(`/api/admin/cars/${car._id}`).send({ documents: { insurance: { expiresOn: '2031-01-31' } } }).expect(200);
        const saved = await Car.findById(car._id).lean();
        expect(saved.documents.insurance.number).toBe(car.documents.insurance.number);
        expect(saved.documents.insurance.expiresOn.toISOString()).toBe('2031-01-30T18:30:00.000Z');
        expect(saved.category).toBe('sedan');
        await admin.post('/api/admin/cars').send({ name: 'X Car', image: '/cars/sedan.svg', capacity: 4, fuelType: 'Petrol', registrationNumber: 'NOT A PLATE!!' }).expect(400);
        await admin.post('/api/admin/cars').send({ name: 'Copy', image: '/cars/sedan.svg', capacity: 4, fuelType: 'Petrol', registrationNumber: car.registrationNumber }).expect(409);
        const list = await admin.get('/api/admin/cars').expect(200);
        expect(list.body.items[0].issue).toBeNull();
    });

    test('a car with open bookings cannot be retired', async () => {
        const admin = await h.admin();
        const car = await h.fleetCar();
        await book(await h.customer(), car);
        const res = await admin.delete(`/api/admin/cars/${car._id}`).expect(409);
        expect(res.body.error.code).toBe('has_bookings');
    });

    test('fleet owners: agreements are validated; owners with cars stay active', async () => {
        const admin = await h.admin();
        await admin.post('/api/admin/owners').send({ name: 'Shiv Travels', type: 'partner', agreement: { startsOn: '2026-12-01', endsOn: '2026-01-01' } }).expect(400);
        const owner = (await admin.post('/api/admin/owners').send({ name: 'Shiv Travels', type: 'partner', phone: '9811100000', agreement: { commissionPercent: 20 } }).expect(201)).body.item;
        await h.fleetCar({ owner: owner._id });
        await admin.patch(`/api/admin/owners/${owner._id}`).send({ active: false }).expect(409);
        const list = await admin.get('/api/admin/owners').expect(200);
        expect(list.body.items[0]).toMatchObject({ name: 'Shiv Travels', cars: 1 });
    });

    test('the dashboard reports operations counts and compliance alerts', async () => {
        const admin = await h.admin();
        await h.chauffeur({ compliance: { licenseExpiry: h.inDays(10) } });
        await book(await h.customer(), await h.fleetCar());
        const res = await admin.get('/api/admin/stats').expect(200);
        expect(res.body.attention.pendingApproval).toBe(1);
        expect(res.body.totals).toMatchObject({ cars: 1, availableCars: 1 });
        expect(res.body.complianceAlerts.some(alert => alert.item === 'Driving licence' && !alert.expired)).toBe(true);
    });
});

describe('background jobs, the rides switch and pure rules', () => {
    test('requests nobody approved before pickup are rejected and the car is freed', async () => {
        const rider = await h.customer();
        const car = await h.fleetCar();
        const booking = await book(rider, car);
        await Booking.updateOne({ _id: booking._id }, { $set: { start: new Date(Date.now() - 60000) } });
        expect(await rejectUnconfirmedRentals()).toBe(1);
        const after = await Booking.findById(booking._id).lean();
        expect(after.status).toBe('rejected');
        expect(after.rejection.reason).toMatch(/before the pickup time/);
        expect((await Car.findById(car._id).select('+slots').lean()).slots.every(s => !s.active)).toBe(true);
    });

    test('with rides switched off, ride endpoints disappear and /meta says so', async () => {
        config.ridesEnabled = false;
        try {
            const meta = await h.request().get('/api/meta').expect(200);
            expect(meta.body.ridesEnabled).toBe(false);
            await h.request().post('/api/rides/quote').send({}).expect(404);
            await h.request().get('/api/circuits').expect(404);
            await h.request().get('/api/promos/offers').expect(404);
        } finally {
            config.ridesEnabled = true;
        }
    });

    test('chauffeurs can apply without a vehicle; the licence must be valid', async () => {
        const base = { role: 'driver', fullName: 'Kamal Singh', username: 'kamal', email: 'kamal@example.test', phoneNumber: '9123400099', password: 'Passw0rd!', drivingLicenseNumber: 'UP6520210009999', dob: '1990-02-02' };
        await h.request().post('/api/auth/register').send({ ...base, licenseExpiry: '2020-01-01' }).expect(400);
        const res = await h.request().post('/api/auth/register').send({ ...base, licenseExpiry: h.inDays(500).toISOString().slice(0, 10), emergencyContact: { name: 'Rita Singh', phone: '9123400098' } }).expect(201);
        expect(res.body).toMatchObject({ pendingApproval: true, account: { status: 'pending', emergencyContact: { name: 'Rita Singh' } } });
        expect(res.body.account.vehicle?.category).toBeUndefined();
    });

    test('with rides off, the assistant answers about chauffeur bookings', async () => {
        config.ridesEnabled = false;
        try {
            const res = await h.request().post('/api/chat').send({ messages: [{ role: 'user', content: 'How do I cancel?' }] }).expect(200);
            expect(res.body.reply).toMatch(/more than 24 h before pickup, full refund/);
            expect(res.body.suggestions).toContain('How do I book a car?');
            const fare = await h.request().post('/api/chat').send({ messages: [{ role: 'user', content: 'fare from Assi Ghat to Sarnath' }] }).expect(200);
            expect(fare.body.actions || []).not.toContainEqual(expect.objectContaining({ to: expect.stringMatching(/^\/ride/) }));
        } finally {
            config.ridesEnabled = true;
        }
    });

    test('admins can find bookings by reference or customer phone, and by work queue', async () => {
        const admin = await h.admin('support');
        const rider = await h.customer({ phoneNumber: '9811177777' });
        const booking = await book(rider, await h.fleetCar());
        await book(await h.customer(), await h.fleetCar(), { start: at(30) });
        const byRef = await admin.get(`/api/admin/bookings?q=${booking.reference}`).expect(200);
        expect(byRef.body.items.map(b => b._id)).toEqual([booking._id]);
        const byPhone = await admin.get('/api/admin/bookings?q=98111777').expect(200);
        expect(byPhone.body.items.map(b => b._id)).toEqual([booking._id]);
        const pending = await admin.get('/api/admin/bookings?view=pending').expect(200);
        expect(pending.body.total).toBe(2);
        // Oldest pickup first in work queues.
        expect(pending.body.items[0]._id).toBe(booking._id);
    });

    test('SOS works once the chauffeur has arrived, and is refused before', async () => {
        const { rider, driver, booking } = await confirmedTrip({ start: at(2.5) });
        await rider.post(`/api/bookings/${booking._id}/sos`).send({}).expect(409);
        await driver.post(`/api/driver/bookings/${booking._id}/arrive`).expect(200);
        const res = await rider.post(`/api/bookings/${booking._id}/sos`).send({ location: { lat: 25.3, lng: 83 } }).expect(201);
        expect(res.body).toMatchObject({ emergencyNumber: '112', shareUrl: null, reference: booking.reference });
    });

    test('nights and calendar days follow Indian time', () => {
        const ist = (s) => new Date(`${s}+05:30`);
        expect(rentals.calendarDays(ist('2026-12-01T18:00:00'), ist('2026-12-02T14:00:00'))).toBe(2);
        expect(rentals.calendarDays(ist('2026-12-01T06:00:00'), ist('2026-12-01T22:00:00'))).toBe(1);
        expect(rentals.nightsBetween(ist('2026-12-01T06:00:00'), ist('2026-12-01T22:59:00'))).toBe(0);
        expect(rentals.nightsBetween(ist('2026-12-01T06:00:00'), ist('2026-12-03T23:30:00'))).toBe(3);
    });

    test('extra hours start after 15 minutes of grace', () => {
        const startedAt = new Date('2026-12-01T04:00:00Z');
        const booking = { rates: { includedKm: 40, includedHours: 4, extraKmRate: 13, extraHourRate: 150, gstPercent: 5 }, trip: { startedAt } };
        const after = minutes => new Date(startedAt.getTime() + minutes * 60000);
        expect(rentals.settle(booking, { actualKm: 40 }, after(4 * 60 + 14)).extraHours).toBe(0);
        expect(rentals.settle(booking, { actualKm: 40 }, after(4 * 60 + 16)).extraHours).toBe(1);
        const long = rentals.settle(booking, { actualKm: 40.4, tolls: 0 }, after(6 * 60 + 30));
        expect(long).toMatchObject({ extraHours: 3, extraHourCharge: 450, extraKm: 1, gst: 23 });
    });

    test('payment status is derived from records and booking status', () => {
        const base = { totalAmount: 1000, status: 'confirmed' };
        expect(rentals.paymentSummary(base, 0, 0).status).toBe('unpaid');
        expect(rentals.paymentSummary(base, 300, 0).status).toBe('advance_paid');
        expect(rentals.paymentSummary({ ...base, status: 'in_progress' }, 300, 0).status).toBe('partially_paid');
        expect(rentals.paymentSummary(base, 1000, 0).status).toBe('paid');
        expect(rentals.paymentSummary({ ...base, status: 'completed', finalAmount: 900 }, 1000, 0)).toMatchObject({ status: 'refund_pending', refundDue: 100 });
        expect(rentals.paymentSummary({ ...base, status: 'cancelled', cancellation: { charge: 0 } }, 0, 0).status).toBe('unpaid');
        expect(rentals.paymentSummary({ ...base, status: 'rejected' }, 500, 500).status).toBe('refunded');
    });
});
