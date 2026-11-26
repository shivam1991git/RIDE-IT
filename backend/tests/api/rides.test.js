const h = require('../setup/helpers');
const { Booking } = require('../../src/modules/bookings/booking.model');
const { expireStaleRideRequests } = require('../../src/modules/bookings/booking-lifecycle.service');
const { computeRideFare } = require('../../src/modules/rides/fare.service');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

const { assi, sarnath, station, delhi } = h.PLACES;

function bookRide(agent, overrides = {}) {
    return agent.post('/api/rides').send({ pickup: assi, drop: sarnath, category: 'mini', paymentMethod: 'cash', ...overrides });
}

describe('fare quotes', () => {
    test('returns all categories with server-side fares and a route', async () => {
        const res = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath });
        expect(res.status).toBe(200);
        expect(res.body.routeSource).toBe('estimate');
        expect(res.body.distanceKm).toBeGreaterThan(10);
        expect(res.body.options.map(o => o.category)).toEqual(['auto', 'mini', 'sedan', 'suv']);
        const mini = res.body.options.find(o => o.category === 'mini');
        const expected = computeRideFare({ baseFare: 50, perKm: 14, perMin: 1.5, minFare: 80 }, res.body.distanceKm, res.body.durationMin).total;
        expect(mini.total).toBe(expected);
        expect(Number.isInteger(mini.total)).toBe(true);
    });

    test('applies the minimum fare on short trips', () => {
        const { total, breakdown } = computeRideFare({ baseFare: 50, perKm: 14, perMin: 1.5, minFare: 80 }, 0.5, 2);
        expect(total).toBe(80);
        expect(breakdown.some(line => /Minimum/.test(line.label))).toBe(true);
    });

    test('rejects places outside the service area, identical places and malformed input', async () => {
        const outside = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: delhi });
        expect(outside.status).toBe(400);
        expect(outside.body.error.message).toMatch(/outside our Varanasi service area/);
        const same = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: assi });
        expect(same.status).toBe(400);
        const bad = await h.request().post('/api/rides/quote').send({ pickup: { name: 'x', lat: 'abc', lng: 1 }, drop: sarnath });
        expect(bad.status).toBe(400);
    });
});

describe('booking a ride', () => {
    test('requires a signed-in customer', async () => {
        await h.request().post('/api/rides').send({ pickup: assi, drop: sarnath, category: 'mini' }).expect(401);
        const driver = await h.driver();
        await bookRide(driver).expect(403);
    });

    test('ignores client-supplied fare, driver and status fields', async () => {
        const rogueDriver = await h.driver();
        const agent = await h.customer();
        const res = await bookRide(agent, { totalAmount: 1, status: 'completed', driver: rogueDriver.doc._id.toString(), fareBreakdown: [] });
        expect(res.status).toBe(201);
        expect(res.body.booking.totalAmount).toBeGreaterThan(80);
        expect(res.body.booking.status).toBe('requested');
        expect(res.body.booking.driver).toBeUndefined();
        expect(res.body.booking.pin).toMatch(/^\d{4}$/);
    });

    test('rejects unknown categories and allows only one active ride per customer', async () => {
        const agent = await h.customer();
        await bookRide(agent, { category: 'helicopter' }).expect(400);
        await bookRide(agent).expect(201);
        const second = await bookRide(agent, { drop: station });
        expect(second.status).toBe(409);
        expect(second.body.error.code).toBe('already_active');
    });

    test('concurrent duplicate requests create exactly one ride', async () => {
        const agent = await h.customer();
        const results = await Promise.all([bookRide(agent), bookRide(agent), bookRide(agent)]);
        expect(results.filter(r => r.status === 201)).toHaveLength(1);
        expect(await Booking.countDocuments({ user: agent.account._id })).toBe(1);
    });

    test('card payment is refused when Stripe is not configured', async () => {
        const agent = await h.customer();
        const res = await bookRide(agent, { paymentMethod: 'card' });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/Card payments are not available/);
    });
});

describe('ride lifecycle', () => {
    test('full happy path: accept → arrive → PIN start → complete → rate', async () => {
        const rider = await h.customer();
        const driver = await h.driver();
        const { booking } = (await bookRide(rider)).body;

        // Before acceptance the driver sees only the rider's first name.
        const requests = await driver.get('/api/driver/requests').expect(200);
        expect(requests.body.rides).toHaveLength(1);
        expect(requests.body.rides[0].user).toEqual({ fullName: 'Asha', rating: { average: null, count: 0 } });
        expect(requests.body.rides[0].pin).toBeUndefined();
        expect(JSON.stringify(requests.body)).not.toMatch(/9876543210|example\.test/);

        const accepted = await driver.post(`/api/driver/bookings/${booking._id}/accept`).expect(200);
        expect(accepted.body.booking.status).toBe('accepted');
        expect(accepted.body.booking.user.phoneNumber).toBe('9876543210');
        expect(accepted.body.booking.pin).toBeUndefined();

        const riderView = await rider.get(`/api/bookings/${booking._id}`).expect(200);
        expect(riderView.body.booking.driver.vehicle.plateNumber).toBe('UP65 AB 1234');

        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin: booking.pin }).expect(409);
        await driver.post(`/api/driver/bookings/${booking._id}/arrive`).expect(200);
        const wrongPin = booking.pin === '0000' ? '1111' : '0000';
        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin: wrongPin }).expect(400);
        await driver.post(`/api/driver/bookings/${booking._id}/start`).send({ pin: booking.pin }).expect(200);

        await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(409);
        await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({}).expect(400);
        const done = await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({ cashCollected: true }).expect(200);
        expect(done.body.booking.status).toBe('completed');
        expect(done.body.booking.payment.status).toBe('paid');
        expect(done.body.booking.timeline.map(t => t.status)).toEqual(['requested', 'accepted', 'arrived', 'in_progress', 'completed']);

        await rider.post(`/api/bookings/${booking._id}/rate`).send({ score: 5, comment: 'Smooth ride' }).expect(200);
        await rider.post(`/api/bookings/${booking._id}/rate`).send({ score: 1 }).expect(409);
        const summary = await driver.get('/api/driver/summary').expect(200);
        expect(summary.body.stats.trips).toBe(1);
        expect(summary.body.stats.earnings).toBe(booking.totalAmount);
        expect(summary.body.driver.rating).toEqual({ average: 5, count: 1 });

        // Rider can book again now that the previous ride is finished.
        await bookRide(rider).expect(201);
        const notifications = await rider.get('/api/notifications').expect(200);
        expect(notifications.body.items.map(n => n.type)).toEqual(expect.arrayContaining(['booking.accepted', 'booking.completed']));
    });

    test('two drivers racing to accept: exactly one wins', async () => {
        const rider = await h.customer();
        const drivers = await Promise.all([h.driver(), h.driver(), h.driver()]);
        const { booking } = (await bookRide(rider)).body;
        const results = await Promise.all(drivers.map(d => d.post(`/api/driver/bookings/${booking._id}/accept`)));
        expect(results.filter(r => r.status === 200)).toHaveLength(1);
        expect(results.filter(r => r.status === 409)).toHaveLength(2);
    });

    test('a driver can hold only one active ride', async () => {
        const driver = await h.driver();
        const riderA = await h.customer();
        const riderB = await h.customer();
        const a = (await bookRide(riderA)).body.booking;
        const b = (await bookRide(riderB)).body.booking;
        await driver.post(`/api/driver/bookings/${a._id}/accept`).expect(200);
        const second = await driver.post(`/api/driver/bookings/${b._id}/accept`);
        expect(second.status).toBe(409);
        expect(second.body.error.code).toBe('already_active');
    });

    test('pending, offline and wrong-category drivers cannot accept', async () => {
        const rider = await h.customer();
        const { booking } = (await bookRide(rider)).body;
        const pending = await h.driver({ status: 'pending' });
        await pending.post(`/api/driver/bookings/${booking._id}/accept`).expect(403);
        const offline = await h.driver({ online: false });
        await offline.post(`/api/driver/bookings/${booking._id}/accept`).expect(400);
        const suv = await h.driver({ category: 'suv' });
        await suv.post(`/api/driver/bookings/${booking._id}/accept`).expect(403);
        await pending.patch('/api/driver/availability').send({ isOnline: true }).expect(403);
    });

    test('drivers cannot act on rides assigned to someone else', async () => {
        const rider = await h.customer();
        const owner = await h.driver();
        const intruder = await h.driver();
        const { booking } = (await bookRide(rider)).body;
        await owner.post(`/api/driver/bookings/${booking._id}/accept`).expect(200);
        await intruder.post(`/api/driver/bookings/${booking._id}/arrive`).expect(403);
        await intruder.get(`/api/bookings/${booking._id}`).expect(404);
    });

    test('released rides go back to the pool', async () => {
        const rider = await h.customer();
        const first = await h.driver();
        const second = await h.driver();
        const { booking } = (await bookRide(rider)).body;
        await first.post(`/api/driver/bookings/${booking._id}/accept`).expect(200);
        await first.post(`/api/driver/bookings/${booking._id}/release`).expect(200);
        await second.post(`/api/driver/bookings/${booking._id}/accept`).expect(200);
    });

    test('customers cannot see or cancel other customers\' rides (IDOR)', async () => {
        const owner = await h.customer();
        const other = await h.customer();
        const { booking } = (await bookRide(owner)).body;
        await other.get(`/api/bookings/${booking._id}`).expect(404);
        await other.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(403);
        const list = await other.get('/api/bookings').expect(200);
        expect(list.body.items).toHaveLength(0);
        await other.get('/api/bookings/not-an-id').expect(400);
    });

    test('customer cancellation frees them to book again', async () => {
        const rider = await h.customer();
        const { booking } = (await bookRide(rider)).body;
        const res = await rider.post(`/api/bookings/${booking._id}/cancel`).send({ reason: 'Plans changed' }).expect(200);
        expect(res.body.booking.status).toBe('cancelled');
        expect(res.body.booking.cancellation.reason).toBe('Plans changed');
        await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(409);
        await bookRide(rider).expect(201);
    });

    test('unaccepted requests expire after 10 minutes', async () => {
        const rider = await h.customer();
        const { booking } = (await bookRide(rider)).body;
        await Booking.collection.updateOne({ _id: Booking.castObject({ _id: booking._id })._id }, { $set: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } });
        expect(await expireStaleRideRequests()).toBe(1);
        const view = await rider.get(`/api/bookings/${booking._id}`).expect(200);
        expect(view.body.booking.status).toBe('expired');
        await bookRide(rider).expect(201);
    });
});
