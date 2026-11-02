const h = require('./helpers');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

const hoursFromNow = hours => new Date(Date.now() + hours * 3600 * 1000).toISOString();

function rent(agent, car, overrides = {}) {
    return agent.post('/api/rentals').send({ carId: car._id.toString(), start: hoursFromNow(24), end: hoursFromNow(27.5), driverRequired: false, paymentMethod: 'cash', ...overrides });
}

test('public car list hides reservation details', async () => {
    const car = await h.car();
    const rider = await h.customer();
    await rent(rider, car).expect(201);
    const list = await h.request().get('/api/cars').expect(200);
    expect(list.body.cars[0].slots).toBeUndefined();
    const detail = await h.request().get(`/api/cars/${car._id}`).expect(200);
    expect(detail.body.busy).toHaveLength(1);
    expect(Object.keys(detail.body.busy[0]).sort()).toEqual(['end', 'start']);
});

test('quote rounds partial hours up and adds the driver charge on the server', async () => {
    const car = await h.car({ rentPerHour: 200 });
    const res = await h.request().post('/api/rentals/quote').send({ carId: car._id.toString(), start: hoursFromNow(5), end: hoursFromNow(7.25), driverRequired: true }).expect(200);
    expect(res.body.hours).toBe(3);
    expect(res.body.total).toBe(3 * 200 + 3 * 30);
    expect(res.body.available).toBe(true);
});

test('rejects past starts, inverted windows and over-long rentals', async () => {
    const car = await h.car();
    const rider = await h.customer();
    await rent(rider, car, { start: hoursFromNow(-2), end: hoursFromNow(2) }).expect(400);
    await rent(rider, car, { start: hoursFromNow(5), end: hoursFromNow(4) }).expect(400);
    await rent(rider, car, { start: hoursFromNow(1), end: hoursFromNow(1 + 24 * 8) }).expect(400);
    await rent(rider, car, { start: hoursFromNow(24 * 20), end: hoursFromNow(24 * 20 + 2) }).expect(400);
    await rent(rider, car, { start: 'tomorrow', end: hoursFromNow(4) }).expect(400);
});

test('overlapping rentals are refused, including concurrent attempts', async () => {
    const car = await h.car();
    const riders = await Promise.all([h.customer(), h.customer(), h.customer()]);
    const results = await Promise.all(riders.map(rider => rent(rider, car)));
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409).every(r => r.body.error.code === 'slot_taken')).toBe(true);

    // Adjacent, non-overlapping slot is fine.
    await rent(riders[1], car, { start: hoursFromNow(27.5), end: hoursFromNow(30) }).expect(201);
});

test('cancelling a rental frees the slot; started rentals cannot be cancelled online', async () => {
    const car = await h.car();
    const rider = await h.customer();
    const { booking } = (await rent(rider, car)).body;
    await rider.post(`/api/bookings/${booking._id}/cancel`).send({}).expect(200);
    await rent(rider, car).expect(201);

    const { Booking } = require('../src/models/Booking'); // eslint-disable-line global-require
    const soon = (await rent(rider, car, { start: hoursFromNow(48), end: hoursFromNow(50) })).body.booking;
    await Booking.updateOne({ _id: soon._id }, { $set: { start: new Date(Date.now() - 60000) } });
    const late = await rider.post(`/api/bookings/${soon._id}/cancel`).send({});
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('too_late');
});

test('chauffeur rentals wait for a driver to claim them', async () => {
    const car = await h.car();
    const rider = await h.customer();
    const { booking } = (await rent(rider, car, { driverRequired: true })).body;
    expect(booking.status).toBe('pending_driver');

    const driver = await h.driver({ online: false });
    const requests = await driver.get('/api/driver/requests').expect(200);
    expect(requests.body.rentals).toHaveLength(1);
    expect(requests.body.rides).toHaveLength(0);

    const claimed = await driver.post(`/api/driver/bookings/${booking._id}/accept`).expect(200);
    expect(claimed.body.booking.status).toBe('confirmed');
    // Rentals do not block the driver from other scheduled work.
    const another = (await rent(await h.customer(), await h.car(), { driverRequired: true })).body.booking;
    await driver.post(`/api/driver/bookings/${another._id}/accept`).expect(200);
    // Not started yet, so it cannot be completed.
    await driver.post(`/api/driver/bookings/${booking._id}/complete`).send({ cashCollected: true }).expect(400);
});

test('retired cars cannot be booked', async () => {
    const car = await h.car({ active: false });
    const rider = await h.customer();
    await rent(rider, car).expect(404);
});
