const h = require('./helpers');
const { Booking } = require('../src/models/Booking');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

describe('authorization boundaries', () => {
    const adminEndpoints = ['/api/admin/stats', '/api/admin/customers', '/api/admin/drivers', '/api/admin/bookings', '/api/admin/fares', '/api/admin/support', '/api/admin/audit', '/api/admin/feedback'];

    test('anonymous, customers and drivers are refused on every admin endpoint', async () => {
        const rider = await h.customer();
        const driver = await h.driver();
        for (const url of adminEndpoints) {
            await h.request().get(url).expect(401);
            await rider.get(url).expect(403);
            await driver.get(url).expect(403);
        }
        await rider.post('/api/admin/cars').send({ name: 'x' }).expect(403);
    });

    test('customers cannot use driver endpoints and drivers cannot book as customers', async () => {
        const rider = await h.customer();
        await rider.get('/api/driver/requests').expect(403);
        await rider.patch('/api/driver/availability').send({ isOnline: true }).expect(403);
        const driver = await h.driver();
        await driver.post('/api/rentals').send({}).expect(403);
        await driver.post('/api/me/places').send({}).expect(403);
    });
});

describe('admin operations', () => {
    test('stats summarise the platform', async () => {
        const admin = await h.admin();
        await h.customer();
        await h.driver({ status: 'pending' });
        const res = await admin.get('/api/admin/stats').expect(200);
        expect(res.body.totals.customers).toBe(1);
        expect(res.body.totals.pendingDrivers).toBe(1);
    });

    test('approving a driver lets them go online and notifies them', async () => {
        const admin = await h.admin();
        const driver = await h.driver({ status: 'pending', online: false });
        await driver.patch('/api/driver/availability').send({ isOnline: true }).expect(403);
        await admin.patch(`/api/admin/drivers/${driver.doc._id}`).send({ status: 'approved' }).expect(200);
        await driver.patch('/api/driver/availability').send({ isOnline: true }).expect(200);
        const notes = await driver.get('/api/notifications').expect(200);
        expect(notes.body.items[0].type).toBe('driver.approved');
    });

    test('suspending a customer ends their session; accounts with history cannot be deleted', async () => {
        const admin = await h.admin();
        const rider = await h.customer();
        await rider.post('/api/rides').send({ pickup: h.PLACES.assi, drop: h.PLACES.sarnath, category: 'auto' }).expect(201);
        await admin.patch(`/api/admin/customers/${rider.account._id}`).send({ status: 'suspended' }).expect(200);
        await rider.get('/api/auth/me').expect(401);
        const del = await admin.delete(`/api/admin/customers/${rider.account._id}`);
        expect(del.status).toBe(409);
        expect(del.body.error.code).toBe('has_history');
    });

    test('admins cannot lock themselves out', async () => {
        const admin = await h.admin();
        await admin.patch(`/api/admin/admins/${admin.doc._id}`).send({ status: 'suspended' }).expect(400);
        await admin.delete(`/api/admin/admins/${admin.doc._id}`).expect(400);
    });

    test('car CRUD validates input and retires cars that have bookings', async () => {
        const admin = await h.admin();
        await admin.post('/api/admin/cars').send({ name: 'X', image: 'javascript:alert(1)', capacity: 4, fuelType: 'Petrol', rentPerHour: 100 }).expect(400);
        const created = await admin.post('/api/admin/cars').send({ name: 'Tata Nexon EV', image: 'https://example.test/nexon.jpg', capacity: 5, fuelType: 'Electric', rentPerHour: 300 }).expect(201);
        const id = created.body.item._id;
        await admin.patch(`/api/admin/cars/${id}`).send({ rentPerHour: 320 }).expect(200);

        const rider = await h.customer();
        const start = new Date(Date.now() + 26 * 3600e3).toISOString();
        const end = new Date(Date.now() + 28 * 3600e3).toISOString();
        await rider.post('/api/rentals').send({ carId: id, start, end }).expect(201);
        const res = await admin.delete(`/api/admin/cars/${id}`).expect(200);
        expect(res.body.retired).toBe(true);
        expect(await Booking.countDocuments({ car: id })).toBe(1);
    });

    test('fare edits change future quotes', async () => {
        const admin = await h.admin();
        const before = await h.request().post('/api/rides/quote').send({ pickup: h.PLACES.assi, drop: h.PLACES.sarnath });
        await admin.patch('/api/admin/fares/mini').send({ perKm: 30 }).expect(200);
        const after = await h.request().post('/api/rides/quote').send({ pickup: h.PLACES.assi, drop: h.PLACES.sarnath });
        const mini = res => res.body.options.find(o => o.category === 'mini').total;
        expect(mini(after)).toBeGreaterThan(mini(before));
        await admin.patch('/api/admin/fares/mini').send({ perKm: -5 }).expect(400);
    });

    test('admin actions are written to the audit log', async () => {
        const admin = await h.admin();
        const driver = await h.driver({ status: 'pending' });
        await admin.patch(`/api/admin/drivers/${driver.doc._id}`).send({ status: 'approved' }).expect(200);
        const log = await admin.get('/api/admin/audit').expect(200);
        expect(log.body.items.map(item => item.action)).toContain('driver.update');
    });

    test('support tickets: user creates, admin replies, user is notified', async () => {
        const admin = await h.admin();
        const rider = await h.customer();
        await rider.post('/api/support').send({ subject: 'Lost item', message: 'I left my bag in the car yesterday.' }).expect(201);
        const tickets = await admin.get('/api/admin/support').expect(200);
        expect(tickets.body.items).toHaveLength(1);
        await admin.patch(`/api/admin/support/${tickets.body.items[0]._id}`).send({ status: 'resolved', adminReply: 'Found it — the driver will drop it off.' }).expect(200);
        const notes = await rider.get('/api/notifications').expect(200);
        expect(notes.body.items[0].type).toBe('support.update');
        const other = await h.customer();
        const mine = await other.get('/api/support').expect(200);
        expect(mine.body.items).toHaveLength(0);
    });
});

describe('profile and saved places', () => {
    test('customers manage their own profile and saved places', async () => {
        const rider = await h.customer();
        const res = await rider.patch('/api/me').send({ fullName: 'Asha V.', status: 'suspended', password: 'x' }).expect(200);
        expect(res.body.account.fullName).toBe('Asha V.');
        expect(res.body.account.status).toBe('active');
        const saved = await rider.post('/api/me/places').send({ label: 'Home', address: 'Lanka, Varanasi', lat: 25.277, lng: 82.999 }).expect(201);
        expect(saved.body.savedPlaces).toHaveLength(1);
        await rider.delete(`/api/me/places/${saved.body.savedPlaces[0]._id}`).expect(200);
    });
});
