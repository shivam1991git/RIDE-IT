const h = require('./helpers');
const { config } = require('../src/config');
const { outbox } = require('../src/services/mailer');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

describe('registration', () => {
    test('creates a customer, signs them in with httpOnly cookies and hides the password', async () => {
        const res = await h.request().post('/api/auth/register').send(h.customerData());
        expect(res.status).toBe(201);
        expect(res.body.account.password).toBeUndefined();
        expect(res.body.account.role).toBe('customer');
        const cookies = res.headers['set-cookie'].join(';');
        expect(cookies).toMatch(/rid_at=.*HttpOnly/i);
        expect(cookies).toMatch(/SameSite=Lax/i);
    });

    test('rejects missing fields, weak passwords and bad phone numbers with clear messages', async () => {
        const missing = await h.request().post('/api/auth/register').send({ role: 'customer' });
        expect(missing.status).toBe(400);
        expect(missing.body.error.code).toBe('validation_failed');

        const weak = await h.request().post('/api/auth/register').send(h.customerData({ password: 'password' }));
        expect(weak.status).toBe(400);
        expect(weak.body.error.message).toMatch(/letter and a number/);

        const phone = await h.request().post('/api/auth/register').send(h.customerData({ phoneNumber: '12345' }));
        expect(phone.status).toBe(400);
        expect(phone.body.error.message).toMatch(/mobile number/);
    });

    test('rejects duplicate email or username, case-insensitively', async () => {
        const data = h.customerData();
        await h.request().post('/api/auth/register').send(data).expect(201);
        const dupe = await h.request().post('/api/auth/register').send({ ...h.customerData(), email: data.email.toUpperCase() });
        expect(dupe.status).toBe(409);
        const dupeUser = await h.request().post('/api/auth/register').send({ ...h.customerData(), username: data.username.toUpperCase() });
        expect(dupeUser.status).toBe(409);
    });

    test('ignores privilege fields sent by the client (mass assignment)', async () => {
        const res = await h.request().post('/api/auth/register').send({ ...h.customerData(), status: 'active', tokenVersion: 99, role: 'customer', isAdmin: true });
        expect(res.status).toBe(201);
        const user = await h.models.User.findById(res.body.account._id).select('+tokenVersion').lean();
        expect(user.tokenVersion).toBe(0);
        expect(user.isAdmin).toBeUndefined();
    });

    test('drivers start pending and get no session until approved flow', async () => {
        const res = await h.request().post('/api/auth/register').send({
            ...h.customerData(),
            role: 'driver',
            drivingLicenseNumber: 'UP6520190001234',
            dob: '1992-05-01',
            vehicle: { category: 'sedan', make: 'Honda', model: 'City', plateNumber: 'up65 cd 9876' },
        });
        expect(res.status).toBe(201);
        expect(res.body.pendingApproval).toBe(true);
        expect(res.body.account.status).toBe('pending');
        expect(res.body.account.vehicle.plateNumber).toBe('UP65 CD 9876');
        expect(res.headers['set-cookie']).toBeUndefined();
    });

    test('there is no public admin registration endpoint', async () => {
        const res = await h.request().post('/api/admins/adminregister').send({ username: 'x', password: 'y' });
        expect(res.status).toBe(404);
        const viaRegister = await h.request().post('/api/auth/register').send({ ...h.customerData(), role: 'admin' });
        expect(viaRegister.status).toBe(400);
    });
});

describe('login and sessions', () => {
    test('accepts username or email and rejects wrong passwords generically', async () => {
        const data = h.customerData();
        await h.request().post('/api/auth/register').send(data);
        await h.request().post('/api/auth/login').send({ role: 'customer', identifier: data.email.toUpperCase(), password: h.PASSWORD }).expect(200);
        const wrong = await h.request().post('/api/auth/login').send({ role: 'customer', identifier: data.username, password: 'nope12345' });
        expect(wrong.status).toBe(401);
        const unknown = await h.request().post('/api/auth/login').send({ role: 'customer', identifier: 'ghost', password: 'nope12345' });
        expect(unknown.status).toBe(401);
        expect(unknown.body.error.message).toBe(wrong.body.error.message);
    });

    test('blocks NoSQL operator injection in login', async () => {
        await h.customer();
        const res = await h.request().post('/api/auth/login').send({ role: 'customer', identifier: { $ne: null }, password: { $ne: null } });
        expect(res.status).toBe(400);
    });

    test('a customer token cannot be used against another role login (role is part of the lookup)', async () => {
        const data = h.customerData();
        await h.request().post('/api/auth/register').send(data);
        const res = await h.request().post('/api/auth/login').send({ role: 'admin', identifier: data.username, password: h.PASSWORD });
        expect(res.status).toBe(401);
    });

    test('upgrades a legacy plaintext password to bcrypt on login', async () => {
        const legacy = await h.models.User.collection.insertOne({ fullName: 'Old User', username: 'olduser', email: 'old@example.test', phoneNumber: 9876543210, pincode: 221005, password: 'plain-old-1' });
        await h.request().post('/api/auth/login').send({ role: 'customer', identifier: 'olduser', password: 'plain-old-1' }).expect(200);
        const stored = await h.models.User.findById(legacy.insertedId).select('+password').lean();
        expect(stored.password).toMatch(/^\$2[aby]\$/);
        expect(stored.phoneNumber).toBe(9876543210); // legacy numbers are readable as-is
    });

    test('/me, logout, and logout-all revoke access', async () => {
        const agent = await h.customer();
        await agent.get('/api/auth/me').expect(200);
        await agent.post('/api/auth/logout').expect(200);
        await agent.get('/api/auth/me').expect(401);

        const other = await h.signIn('customer', agent.account.username);
        expect(other.accessToken).toBeTruthy();
        await h.request().get('/api/auth/me').set('Authorization', `Bearer ${other.accessToken}`).expect(200);
        await other.post('/api/auth/logout-all').expect(200);
        // A token captured before "log out everywhere" no longer works.
        await h.request().get('/api/auth/me').set('Authorization', `Bearer ${other.accessToken}`).expect(401);
    });

    test('refresh issues a new access token from the refresh cookie', async () => {
        const agent = await h.customer();
        const res = await agent.post('/api/auth/refresh');
        expect(res.status).toBe(200);
        expect(res.headers['set-cookie'].join(';')).toMatch(/rid_at=/);
        await h.request().post('/api/auth/refresh').expect(401);
    });

    test('/session returns null for guests and renews an expired access cookie from the refresh cookie', async () => {
        const guest = await h.request().get('/api/auth/session').expect(200);
        expect(guest.body.account).toBeNull();
        const data = h.customerData();
        await h.request().post('/api/auth/register').send(data).expect(201);
        const login = await h.request().post('/api/auth/login').send({ role: 'customer', identifier: data.username, password: h.PASSWORD });
        const refresh = login.headers['set-cookie'].join(';').match(/rid_rt=([^;]+)/)[1];
        // Only the refresh cookie, as if the 15-minute access cookie had expired.
        const renewed = await h.request().get('/api/auth/session').set('Cookie', `rid_rt=${refresh}`).expect(200);
        expect(renewed.body.account.username).toBe(data.username);
        expect(renewed.headers['set-cookie'].join(';')).toMatch(/rid_at=[^;]+/);
    });

    test('expired or tampered tokens are rejected', async () => {
        const jwt = require('jsonwebtoken'); // eslint-disable-line global-require
        const agent = await h.customer();
        const expired = jwt.sign({ sub: agent.account._id, role: 'customer', tv: 0 }, config.jwtSecret, { expiresIn: -10 });
        const res = await h.request().get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
        expect(res.status).toBe(401);
        expect(res.body.error.message).toMatch(/expired/);
        const forged = jwt.sign({ sub: agent.account._id, role: 'admin', tv: 0 }, 'wrong-secret');
        await h.request().get('/api/admin/stats').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    test('suspended accounts are locked out immediately', async () => {
        const agent = await h.customer();
        await h.models.User.updateOne({ _id: agent.account._id }, { status: 'suspended' });
        await agent.get('/api/auth/me').expect(403);
    });

    test('login is rate limited per account', async () => {
        const data = h.customerData();
        await h.request().post('/api/auth/register').send(data);
        config.rateLimitDisabled = false;
        try {
            const statuses = [];
            for (let i = 0; i < 10; i += 1) {
                const res = await h.request().post('/api/auth/login').send({ role: 'customer', identifier: data.username, password: 'wrong-pass-1' });
                statuses.push(res.status);
            }
            expect(statuses.slice(0, 8).every(status => status === 401)).toBe(true);
            expect(statuses[9]).toBe(429);
        } finally {
            config.rateLimitDisabled = true;
        }
    });
});

describe('password reset and change', () => {
    test('forgot password sends a single-use link; reset works once and revokes sessions', async () => {
        const agent = await h.customer();
        outbox.length = 0;
        const res = await h.request().post('/api/auth/forgot-password').send({ role: 'customer', email: agent.account.email });
        expect(res.status).toBe(200);
        const unknown = await h.request().post('/api/auth/forgot-password').send({ role: 'customer', email: 'nobody@example.test' });
        expect(unknown.body.message).toBe(res.body.message);
        expect(outbox).toHaveLength(1);

        const token = outbox[0].text.match(/token=([a-f\d]{64})/)[1];
        await h.request().post('/api/auth/reset-password').send({ role: 'customer', token, password: 'NewPassw0rd' }).expect(200);
        await h.request().post('/api/auth/reset-password').send({ role: 'customer', token, password: 'NewPassw0rd2' }).expect(400);
        await agent.get('/api/auth/me').expect(401);
        await h.signIn('customer', agent.account.username, 'NewPassw0rd');
    });

    test('change password requires the current password', async () => {
        const agent = await h.customer();
        await agent.post('/api/auth/change-password').send({ currentPassword: 'wrong', newPassword: 'Another1pass' }).expect(400);
        await agent.post('/api/auth/change-password').send({ currentPassword: h.PASSWORD, newPassword: 'Another1pass' }).expect(200);
        await agent.get('/api/auth/me').expect(200);
    });
});
