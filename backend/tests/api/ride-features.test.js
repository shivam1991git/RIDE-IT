// v3 rider-experience features: multi-stop rides and Darshan Circuits,
// scheduled rides, promo codes, ride preferences, live trip sharing and SOS.
const mongoose = require('mongoose');
const h = require('../setup/helpers');
const { Booking } = require('../../src/modules/bookings/booking.model');
const { Promo, PromoRedemption } = require('../../src/modules/rides/promo.model');
const { SupportTicket } = require('../../src/modules/support/support-ticket.model');
const { dispatchScheduledRides, expireStaleRideRequests } = require('../../src/modules/bookings/booking-lifecycle.service');
const { computeRideFare, WAIT_RATE_SHARE } = require('../../src/modules/rides/fare.service');
const geo = require('../../src/modules/geo/geo.service');

beforeAll(h.setup);
afterAll(h.teardown);
beforeEach(h.reset);

const { assi, sarnath, station, delhi } = h.PLACES;
const bhu = { name: 'Banaras Hindu University', address: 'Lanka, Varanasi', lat: 25.2677, lng: 82.9913 };
const godowlia = { name: 'Godowlia Chowk', address: 'Godowlia, Varanasi', lat: 25.3089, lng: 83.0070 };

const minutesFromNow = min => new Date(Date.now() + min * 60 * 1000);
const ride = (agent, body = {}) => agent.post('/api/rides').send({ pickup: assi, drop: sarnath, category: 'mini', ...body });

async function promo(overrides = {}) {
    return Promo.create({
        code: 'WELCOME50',
        description: '50% off',
        kind: 'percent',
        value: 50,
        maxDiscount: 100,
        validUntil: minutesFromNow(60 * 24),
        ...overrides,
    });
}

async function acceptedRide() {
    const rider = await h.customer();
    const driver = await h.driver();
    const created = await ride(rider).expect(201);
    const id = created.body.booking._id;
    await driver.post(`/api/driver/bookings/${id}/accept`).expect(200);
    return { rider, driver, id, pin: created.body.booking.pin };
}

describe('multi-stop rides and Darshan Circuits', () => {
    test('quote prices every leg plus waiting time at stops', async () => {
        const res = await h.request().post('/api/rides/quote')
            .send({ pickup: station, drop: sarnath, stops: [{ ...godowlia, waitMin: 20 }, { ...assi, waitMin: 10 }] })
            .expect(200);
        const route = await geo.getMultiRoute([station, godowlia, assi, sarnath]);
        expect(res.body.distanceKm).toBe(route.distanceKm);
        expect(res.body.waitMin).toBe(30);
        const mini = res.body.options.find(o => o.category === 'mini');
        const expected = computeRideFare({ baseFare: 50, perKm: 14, perMin: 1.5, minFare: 80 }, route.distanceKm, route.durationMin, 30);
        expect(mini.total).toBe(expected.total);
        const waitLine = mini.breakdown.find(line => /Waiting at stops/.test(line.label));
        expect(waitLine.amount).toBe(30 * 1.5 * WAIT_RATE_SHARE);
        // The route passes through every stop, in order.
        expect(res.body.geometry[0]).toEqual([station.lat, station.lng]);
        expect(res.body.geometry).toContainEqual([godowlia.lat, godowlia.lng]);
        expect(res.body.geometry.at(-1)).toEqual([sarnath.lat, sarnath.lng]);
    });

    test('a stop makes the trip longer and dearer than the direct ride', async () => {
        const direct = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath }).expect(200);
        const viaBhu = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, stops: [{ ...bhu, waitMin: 0 }] }).expect(200);
        expect(viaBhu.body.distanceKm).toBeGreaterThan(direct.body.distanceKm);
        expect(viaBhu.body.options[1].total).toBeGreaterThan(direct.body.options[1].total);
    });

    test('round trips are allowed with stops but not without', async () => {
        await h.request().post('/api/rides/quote').send({ pickup: assi, drop: assi }).expect(400);
        const res = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: assi, stops: [{ ...sarnath, waitMin: 90 }] });
        expect(res.status).toBe(200);
        expect(res.body.distanceKm).toBeGreaterThan(20);
    });

    test('rejects more than 3 stops, stops outside the area, stops on top of each other and bad wait times', async () => {
        const four = [godowlia, bhu, station, assi].map(p => ({ ...p, waitMin: 5 }));
        const tooMany = await h.request().post('/api/rides/quote').send({ pickup: sarnath, drop: sarnath, stops: four });
        expect(tooMany.status).toBe(400);
        expect(tooMany.body.error.message).toMatch(/at most 3 stops/);

        const outside = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, stops: [{ ...delhi, waitMin: 0 }] });
        expect(outside.body.error.message).toMatch(/Stop 1 is outside/);

        const sameSpot = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, stops: [{ ...assi, name: 'Assi again', waitMin: 0 }] });
        expect(sameSpot.body.error.message).toMatch(/Stop 1 is too close/);

        const longWait = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, stops: [{ ...bhu, waitMin: 500 }] });
        expect(longWait.status).toBe(400);
        const fractional = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, stops: [{ ...bhu, waitMin: 2.5 }] });
        expect(fractional.status).toBe(400);
    });

    test('circuits are listed with resolved landmark coordinates and can be booked', async () => {
        const res = await h.request().get('/api/circuits').expect(200);
        expect(res.body.circuits.map(c => c.key)).toEqual(['kashi-darshan', 'ghats-trail', 'sarnath-return', 'heritage-day']);
        const sarnathReturn = res.body.circuits.find(c => c.key === 'sarnath-return');
        expect(sarnathReturn.drop).toBe('pickup');
        expect(sarnathReturn.stops[0]).toMatchObject({ name: 'Sarnath', waitMin: 90, lat: expect.any(Number) });

        const rider = await h.customer();
        const booked = await ride(rider, { pickup: station, drop: station, stops: sarnathReturn.stops, circuit: 'sarnath-return' }).expect(201);
        expect(booked.body.booking.circuit).toBe('sarnath-return');
        expect(booked.body.booking.stops).toHaveLength(1);
        await ride(await h.customer(), { circuit: 'moon-trip' }).expect(400);
    });

    test('the driver sees stops, preferences and the note on an open request', async () => {
        const rider = await h.customer();
        const driver = await h.driver();
        await ride(rider, {
            stops: [{ ...bhu, waitMin: 15 }],
            preferences: { quiet: true, luggage: true },
            noteToDriver: 'Gate 2, near the blue kiosk',
        }).expect(201);
        const { body } = await driver.get('/api/driver/requests').expect(200);
        expect(body.rides).toHaveLength(1);
        expect(body.rides[0].stops[0].name).toBe(bhu.name);
        expect(body.rides[0].preferences).toEqual({ quiet: true, luggage: true });
        expect(body.rides[0].noteToDriver).toBe('Gate 2, near the blue kiosk');
        expect(body.rides[0].user.phoneNumber).toBeUndefined();
    });

    test('note to driver is trimmed, length-limited and unknown preference keys are dropped', async () => {
        const rider = await h.customer();
        await ride(rider, { noteToDriver: 'x'.repeat(201) }).expect(400);
        const ok = await ride(rider, { noteToDriver: '   ', preferences: { quiet: true, smoking: true } });
        expect(ok.status).toBe(201);
        expect(ok.body.booking.noteToDriver).toBe('');
        expect(ok.body.booking.preferences).toEqual({ quiet: true });
    });
});

describe('scheduled rides', () => {
    test('validates the pickup time window', async () => {
        const rider = await h.customer();
        const tooSoon = await ride(rider, { scheduledFor: minutesFromNow(10).toISOString() });
        expect(tooSoon.status).toBe(400);
        expect(tooSoon.body.error.message).toMatch(/at least 30 minutes/);
        const tooFar = await ride(rider, { scheduledFor: minutesFromNow(60 * 24 * 8).toISOString() });
        expect(tooFar.body.error.message).toMatch(/up to 7 days/);
        await ride(rider, { scheduledFor: 'tomorrow morning' }).expect(400);
    });

    test('a scheduled ride is not visible to drivers and does not block booking a ride now', async () => {
        const rider = await h.customer();
        const driver = await h.driver();
        const scheduled = await ride(rider, { scheduledFor: minutesFromNow(120).toISOString() }).expect(201);
        expect(scheduled.body.booking.status).toBe('scheduled');
        expect(scheduled.body.booking.pin).toMatch(/^\d{4}$/);

        expect((await driver.get('/api/driver/requests')).body.rides).toHaveLength(0);
        await driver.post(`/api/driver/bookings/${scheduled.body.booking._id}/accept`).expect(409);

        await ride(rider, { drop: station }).expect(201);
        const upcoming = await rider.get('/api/bookings?scope=active').expect(200);
        expect(upcoming.body.items.map(b => b.status).sort()).toEqual(['requested', 'scheduled']);
    });

    test('limits a rider to 3 upcoming scheduled rides', async () => {
        const rider = await h.customer();
        for (const offset of [60, 90, 120]) {
            await ride(rider, { scheduledFor: minutesFromNow(offset).toISOString() }).expect(201);
        }
        const fourth = await ride(rider, { scheduledFor: minutesFromNow(150).toISOString() });
        expect(fourth.status).toBe(400);
        expect(fourth.body.error.message).toMatch(/at most 3 scheduled/);
    });

    test('dispatches 15 minutes before pickup, then a driver can accept it', async () => {
        const rider = await h.customer();
        const driver = await h.driver();
        const pickupAt = minutesFromNow(40);
        const { body } = await ride(rider, { scheduledFor: pickupAt.toISOString() }).expect(201);
        const id = body.booking._id;

        expect(await dispatchScheduledRides(new Date(pickupAt.getTime() - 20 * 60 * 1000))).toEqual({ dispatched: 0, expired: 0, waiting: 0 });
        expect((await dispatchScheduledRides(new Date(pickupAt.getTime() - 14 * 60 * 1000))).dispatched).toBe(1);

        const after = await rider.get(`/api/bookings/${id}`).expect(200);
        expect(after.body.booking.status).toBe('requested');
        expect(after.body.booking.timeline.map(t => t.status)).toEqual(['scheduled', 'requested']);
        await driver.post(`/api/driver/bookings/${id}/accept`).expect(200);
        // Running the sweeper again is harmless.
        expect((await dispatchScheduledRides(new Date(pickupAt.getTime()))).dispatched).toBe(0);
    });

    test('a dispatched scheduled ride is not expired before its pickup time', async () => {
        const rider = await h.customer();
        const pickupAt = minutesFromNow(40);
        const { body } = await ride(rider, { scheduledFor: pickupAt.toISOString() }).expect(201);
        await dispatchScheduledRides(new Date(pickupAt.getTime() - 14 * 60 * 1000));
        // Pretend the request has been open for a long time: it must still wait for its pickup time.
        await Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(body.booking._id) }, { $set: { updatedAt: minutesFromNow(-30) } });
        expect(await expireStaleRideRequests()).toBe(0);
        expect((await Booking.findById(body.booking._id)).status).toBe('requested');
    });

    test('waits while the rider is on another trip, then expires after the grace period', async () => {
        const rider = await h.customer();
        const pickupAt = minutesFromNow(45);
        const scheduled = await ride(rider, { scheduledFor: pickupAt.toISOString() }).expect(201);
        await ride(rider, { drop: station }).expect(201); // live ride holds the lock

        expect((await dispatchScheduledRides(new Date(pickupAt.getTime() - 10 * 60 * 1000))).waiting).toBe(1);
        expect((await Booking.findById(scheduled.body.booking._id)).status).toBe('scheduled');

        expect((await dispatchScheduledRides(new Date(pickupAt.getTime() + 20 * 60 * 1000))).expired).toBe(1);
        const expired = await Booking.findById(scheduled.body.booking._id);
        expect(expired.status).toBe('expired');
        expect(expired.cancellation.reason).toMatch(/another trip/);
    });

    test('the rider can cancel a scheduled ride for free', async () => {
        const rider = await h.customer();
        const { body } = await ride(rider, { scheduledFor: minutesFromNow(90).toISOString() }).expect(201);
        const cancelled = await rider.post(`/api/bookings/${body.booking._id}/cancel`).send({}).expect(200);
        expect(cancelled.body.booking.status).toBe('cancelled');
        expect((await dispatchScheduledRides(minutesFromNow(90))).dispatched).toBe(0);
    });
});

describe('promo codes', () => {
    test('quote shows the discount on every eligible category, with a capped percent', async () => {
        await promo();
        const res = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, promoCode: ' welcome50 ' }).expect(200);
        expect(res.body.promo).toEqual({ code: 'WELCOME50', valid: true, message: null });
        for (const option of res.body.options) {
            const expected = Math.min(Math.floor(option.originalTotal / 2), 100);
            expect(option.discount).toBe(expected);
            expect(option.total).toBe(option.originalTotal - expected);
            expect(option.breakdown.at(-1)).toEqual({ label: 'Promo WELCOME50', amount: -expected });
        }
    });

    test('an invalid code never breaks the quote and explains why', async () => {
        const res = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, promoCode: 'NOPE' }).expect(200);
        expect(res.body.promo).toMatchObject({ valid: false, message: 'This promo code is not valid' });
        expect(res.body.options.every(o => o.discount === undefined)).toBe(true);
    });

    test.each([
        ['expired', { validUntil: minutesFromNow(-1) }, /expired/],
        ['not started', { validFrom: minutesFromNow(60) }, /not active yet/],
        ['inactive', { active: false }, /not valid/],
        ['below minimum fare', { minFare: 5000 }, /minimum ₹5000/],
        ['fully redeemed', { usageLimit: 2, usedCount: 2 }, /fully redeemed/],
    ])('rejects a code that is %s', async (label, overrides, message) => {
        await promo(overrides);
        const res = await ride(await h.customer(), { promoCode: 'WELCOME50' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('promo_invalid');
        expect(res.body.error.message).toMatch(message);
        expect(await Booking.countDocuments()).toBe(0);
    });

    test('category-limited codes apply only to those categories', async () => {
        await promo({ code: 'AUTOFLAT', kind: 'flat', value: 20, categories: ['auto'] });
        const quote = await h.request().post('/api/rides/quote').send({ pickup: assi, drop: sarnath, promoCode: 'AUTOFLAT' }).expect(200);
        expect(quote.body.options.find(o => o.category === 'auto').discount).toBe(20);
        expect(quote.body.options.find(o => o.category === 'mini').promoError).toMatch(/only works on auto/);
        await ride(await h.customer(), { promoCode: 'AUTOFLAT' }).expect(400);
        await ride(await h.customer(), { promoCode: 'AUTOFLAT', category: 'auto' }).expect(201);
    });

    test('a flat discount larger than the fare makes the ride free, never negative', async () => {
        await promo({ code: 'FREERIDE', kind: 'flat', value: 5000 });
        const res = await ride(await h.customer(), { promoCode: 'FREERIDE', drop: station }).expect(201);
        expect(res.body.booking.totalAmount).toBe(0);
        expect(res.body.booking.promo.discount).toBeGreaterThan(0);
    });

    test('booking stores the discounted fare and the code is single-use per rider', async () => {
        await promo();
        const rider = await h.customer();
        const first = await ride(rider, { promoCode: 'WELCOME50' }).expect(201);
        expect(first.body.booking.promo.code).toBe('WELCOME50');
        await rider.post(`/api/bookings/${first.body.booking._id}/cancel`).send({}).expect(200);

        // Cancelling gave the use back, so the rider can use it again.
        expect((await Promo.findOne({ code: 'WELCOME50' })).usedCount).toBe(0);
        const second = await ride(rider, { promoCode: 'WELCOME50' }).expect(201);
        const driver = await h.driver();
        await driver.post(`/api/driver/bookings/${second.body.booking._id}/accept`).expect(200);

        const quote = await rider.post('/api/rides/quote').send({ pickup: assi, drop: station, promoCode: 'WELCOME50' }).expect(200);
        expect(quote.body.promo.message).toMatch(/already used/);
    });

    test('concurrent bookings cannot exceed the per-rider limit', async () => {
        await promo({ perUserLimit: 1 });
        const rider = await h.customer();
        // Different scheduled times so the one-active-ride rule does not interfere.
        const results = await Promise.all([60, 90, 120].map(offset => ride(rider, { promoCode: 'WELCOME50', scheduledFor: minutesFromNow(offset).toISOString() })));
        expect(results.filter(r => r.status === 201)).toHaveLength(1);
        expect(await PromoRedemption.countDocuments()).toBe(1);
        expect((await Promo.findOne()).usedCount).toBe(1);
    });

    test('concurrent riders cannot exceed the global usage limit', async () => {
        await promo({ usageLimit: 2 });
        const riders = await Promise.all([1, 2, 3, 4].map(() => h.customer()));
        const results = await Promise.all(riders.map(rider => ride(rider, { promoCode: 'WELCOME50' })));
        expect(results.filter(r => r.status === 201)).toHaveLength(2);
        expect((await Promo.findOne()).usedCount).toBe(2);
    });

    test('a failed booking gives the promo use back', async () => {
        await promo({ usageLimit: 5 });
        const rider = await h.customer();
        await ride(rider).expect(201); // holds the active-ride lock
        const second = await ride(rider, { promoCode: 'WELCOME50', drop: station });
        expect(second.status).toBe(409);
        expect((await Promo.findOne()).usedCount).toBe(0);
        expect(await PromoRedemption.countDocuments()).toBe(0);
    });

    test('an expired ride request gives the promo use back', async () => {
        await promo();
        const rider = await h.customer();
        const { body } = await ride(rider, { promoCode: 'WELCOME50' }).expect(201);
        await Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(body.booking._id) }, { $set: { updatedAt: minutesFromNow(-30) } });
        expect(await expireStaleRideRequests()).toBe(1);
        expect((await Promo.findOne()).usedCount).toBe(0);
    });

    test('the driver earns the full fare; RIDE-IT funds the promo', async () => {
        await promo({ code: 'FLAT50', kind: 'flat', value: 50 });
        const rider = await h.customer();
        const driver = await h.driver();
        const { body } = await ride(rider, { promoCode: 'FLAT50' }).expect(201);
        const id = body.booking._id;
        const paid = body.booking.totalAmount;
        await driver.post(`/api/driver/bookings/${id}/accept`).expect(200);
        await driver.post(`/api/driver/bookings/${id}/arrive`).expect(200);
        await driver.post(`/api/driver/bookings/${id}/start`).send({ pin: body.booking.pin }).expect(200);
        await driver.post(`/api/driver/bookings/${id}/complete`).send({ cashCollected: true }).expect(200);
        const summary = await driver.get('/api/driver/summary').expect(200);
        expect(summary.body.stats.earnings).toBe(paid + 50);
        expect(summary.body.stats.todayEarnings).toBe(paid + 50);
        expect(summary.body.daily[0].earnings).toBe(paid + 50);
    });

    test('public offers list only live, public, unexhausted codes', async () => {
        await promo({ code: 'LIVE10', kind: 'flat', value: 10 });
        await promo({ code: 'HIDDEN', public: false });
        await promo({ code: 'OLDONE', validUntil: minutesFromNow(-5) });
        await promo({ code: 'GONE', usageLimit: 1, usedCount: 1 });
        const { body } = await h.request().get('/api/promos/offers').expect(200);
        expect(body.offers.map(o => o.code)).toEqual(['LIVE10']);
        expect(body.offers[0].usedCount).toBeUndefined();
    });

    test('admins create, validate and update promos', async () => {
        const admin = await h.admin();
        const rider = await h.customer();
        const body = { code: 'diwali25', kind: 'percent', value: 25, maxDiscount: 75, validUntil: minutesFromNow(600).toISOString() };
        await rider.post('/api/admin/promos').send(body).expect(403);

        const created = await admin.post('/api/admin/promos').send(body).expect(201);
        expect(created.body.item).toMatchObject({ code: 'DIWALI25', perUserLimit: 1, public: true, active: true });
        expect((await admin.post('/api/admin/promos').send(body)).status).toBe(409);
        expect((await admin.post('/api/admin/promos').send({ ...body, code: 'BIG', value: 95 })).body.error.message).toMatch(/at most 90%/);
        expect((await admin.post('/api/admin/promos').send({ ...body, code: 'X!' })).status).toBe(400);
        expect((await admin.post('/api/admin/promos').send({ ...body, code: 'BACKWARDS', validUntil: minutesFromNow(-60).toISOString() })).body.error.message).toMatch(/must be after/);

        const id = created.body.item._id;
        const updated = await admin.patch(`/api/admin/promos/${id}`).send({ active: false }).expect(200);
        // A partial update changes only what was sent; defaults do not overwrite other fields.
        expect(updated.body.item).toMatchObject({ active: false, value: 25, maxDiscount: 75, perUserLimit: 1, code: 'DIWALI25' });
        await admin.patch(`/api/admin/promos/${id}`).send({}).expect(400);
        const list = await admin.get('/api/admin/promos').expect(200);
        expect(list.body.items).toHaveLength(1);
    });
});

describe('live trip sharing', () => {
    test('the rider shares a link that shows a safe subset of the trip', async () => {
        const { rider, id } = await acceptedRide();
        const shared = await rider.post(`/api/bookings/${id}/share`).expect(200);
        expect(shared.body.url).toMatch(/\/share\/[A-Za-z0-9_-]{24}$/);
        // Sharing twice returns the same link.
        expect((await rider.post(`/api/bookings/${id}/share`)).body.token).toBe(shared.body.token);

        const view = await h.request().get(`/api/share/${shared.body.token}`).expect(200);
        const { trip } = view.body;
        expect(trip).toMatchObject({ status: 'accepted', ended: false, riderFirstName: 'Asha' });
        expect(trip.driver).toMatchObject({ firstName: 'Ravi', vehicle: { plateNumber: 'UP65 AB 1234' } });
        const text = JSON.stringify(view.body);
        for (const secret of ['phoneNumber', 'pin', 'email', 'payment', 'totalAmount', 'Verma', '9876543210', '9123456780']) {
            expect(text).not.toContain(secret);
        }
        const booking = await rider.get(`/api/bookings/${id}`).expect(200);
        expect(booking.body.booking.sharing).toBe(true);
        expect(booking.body.booking.shareToken).toBeUndefined();
    });

    test('only the owner can share; links can be turned off; bad tokens are rejected', async () => {
        const { rider, driver, id } = await acceptedRide();
        const stranger = await h.customer();
        await stranger.post(`/api/bookings/${id}/share`).expect(404);
        await driver.post(`/api/bookings/${id}/share`).expect(403);

        const { body } = await rider.post(`/api/bookings/${id}/share`).expect(200);
        await rider.delete(`/api/bookings/${id}/share`).expect(204);
        await h.request().get(`/api/share/${body.token}`).expect(404);
        await h.request().get('/api/share/short').expect(400);
        await h.request().get('/api/share/aaaaaaaaaaaaaaaaaaaaaaaa').expect(404);
    });

    test('an ended trip shows only its status, and the link expires after an hour', async () => {
        const { rider, id } = await acceptedRide();
        const { body } = await rider.post(`/api/bookings/${id}/share`).expect(200);
        await rider.post(`/api/bookings/${id}/cancel`).send({}).expect(200);

        const ended = await h.request().get(`/api/share/${body.token}`).expect(200);
        expect(ended.body.trip).toMatchObject({ status: 'cancelled', ended: true });
        expect(ended.body.trip.driver).toBeUndefined();
        expect(ended.body.trip.pickup).toBeUndefined();

        await Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { updatedAt: minutesFromNow(-90) } });
        await h.request().get(`/api/share/${body.token}`).expect(410);
        await rider.post(`/api/bookings/${id}/share`).expect(409);
    });

    test('rentals cannot be shared', async () => {
        const rider = await h.customer();
        const car = await h.fleetCar();
        const rental = await rider.post('/api/rentals').send({ rentalType: 'hourly', packageKey: '4h40', pickup: h.PLACES.assi, start: minutesFromNow(180).toISOString(), passengers: 2, carId: car._id.toString() }).expect(201);
        const res = await rider.post(`/api/bookings/${rental.body.booking._id}/share`);
        expect(res.status).toBe(400);
    });
});

describe('SOS and trusted contact', () => {
    test('trusted contact is validated and cannot be the rider themselves', async () => {
        const rider = await h.customer();
        await rider.put('/api/me/trusted-contact').send({ name: 'Me', phone: '9876543210' }).expect(400);
        await rider.put('/api/me/trusted-contact').send({ name: 'Mum', phone: '12345' }).expect(400);
        const ok = await rider.put('/api/me/trusted-contact').send({ name: 'Mum', phone: '98765 00000' }).expect(200);
        expect(ok.body.trustedContact).toMatchObject({ name: 'Mum', phone: '9876500000' });
        await rider.delete('/api/me/trusted-contact').expect(204);
        const driver = await h.driver();
        await driver.put('/api/me/trusted-contact').send({ name: 'Mum', phone: '9876500000' }).expect(403);
    });

    test('SOS during a trip raises an urgent ticket at the top of the admin queue', async () => {
        const admin = await h.admin();
        const { rider, id } = await acceptedRide();
        await rider.post('/api/support').send({ subject: 'Lost umbrella', message: 'I left my umbrella in the car yesterday.' });
        await rider.put('/api/me/trusted-contact').send({ name: 'Mum', phone: '9876500000' }).expect(200);

        const sos = await rider.post(`/api/bookings/${id}/sos`).send({ location: { lat: 25.3, lng: 83.0 } }).expect(201);
        expect(sos.body).toMatchObject({ emergencyNumber: '112', trustedContact: { name: 'Mum', phone: '9876500000' } });
        expect(sos.body.shareUrl).toMatch(/\/share\//);

        const ticket = await SupportTicket.findById(sos.body.ticketId);
        expect(ticket).toMatchObject({ priority: 'urgent', source: 'sos', status: 'open' });
        expect(ticket.message).toContain('25.30000, 83.00000');

        const queue = await admin.get('/api/admin/support').expect(200);
        expect(queue.body.items[0]._id).toBe(sos.body.ticketId);
        expect((await Booking.findById(id)).sosAt).toBeInstanceOf(Date);
    });

    test('SOS is only for the rider of an active trip', async () => {
        const rider = await h.customer();
        const { body } = await ride(rider).expect(201); // still searching for a driver
        await rider.post(`/api/bookings/${body.booking._id}/sos`).send({}).expect(409);

        const { id } = await acceptedRide();
        await rider.post(`/api/bookings/${id}/sos`).send({}).expect(404);
        await h.request().post(`/api/bookings/${id}/sos`).send({}).expect(401);
        await rider.post(`/api/bookings/${id}/sos`).send({ location: { lat: 999, lng: 0 } }).expect(400);
    });
});

describe('chat assistant knows the new features', () => {
    test.each([
        ['Can I schedule a ride for tomorrow?', /schedule a ride/],
        ['Do you have any promo code or offers?', /Offers/],
        ['Can I add stops for a temple darshan tour?', /Darshan Circuit/],
    ])('%s', async (message, reply) => {
        const res = await h.request().post('/api/chat').send({ messages: [{ role: 'user', content: message }] });
        expect(res.status).toBe(200);
        expect(res.body.reply).toMatch(reply);
    });
});
