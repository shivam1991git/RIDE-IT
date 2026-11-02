const express = require('express');
const { accountModel, CASE_INSENSITIVE } = require('../models/accounts');
const { Booking, ALL_STATUSES } = require('../models/Booking');
const Car = require('../models/Car');
const { FareConfig, Feedback, SupportTicket, AuditLog } = require('../models/misc');
const { requireAuth } = require('../middleware/auth');
const { validate, idParams } = require('../middleware/common');
const { transition } = require('../services/bookings');
const { hashPassword } = require('../services/auth');
const { notify, audit } = require('../services/notify');
const { loadForViewer } = require('./booking');
const v = require('../validation');
const { asyncHandler, notFound, conflict, badRequest, paginate, escapeRegex } = require('../utils/http');

const router = express.Router();
const { z } = v;

router.use(requireAuth('admin'));

const listQuery = z.object({
    q: z.string().trim().max(60).optional(),
    status: z.string().max(20).optional(),
    type: z.enum(['ride', 'rental']).optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
});

function searchFilter(q, fields) {
    if (!q) return {};
    const pattern = new RegExp(escapeRegex(q), 'i');
    return { $or: fields.map(field => ({ [field]: pattern })) };
}

// ---------- Dashboard ----------

router.get('/stats', asyncHandler(async (req, res) => {
    const Users = accountModel('customer');
    const Drivers = accountModel('driver');
    const since = new Date(Date.now() - 13 * 24 * 3600 * 1000);
    since.setHours(0, 0, 0, 0);

    const [customers, drivers, pendingDrivers, onlineDrivers, cars, openTickets, byStatus, revenue, daily, byCategory] = await Promise.all([
        Users.countDocuments(),
        Drivers.countDocuments(),
        Drivers.countDocuments({ status: 'pending' }),
        Drivers.countDocuments({ status: 'approved', isOnline: true }),
        Car.countDocuments({ active: true }),
        SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
        Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Booking.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$type', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
        Booking.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
                    bookings: { $sum: 1 },
                    completedRevenue: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalAmount', 0] } },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        Booking.aggregate([{ $match: { type: 'ride' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    ]);

    res.json({
        totals: { customers, drivers, pendingDrivers, onlineDrivers, cars, openTickets },
        bookingsByStatus: Object.fromEntries(byStatus.map(row => [row._id || 'unknown', row.count])),
        revenue: Object.fromEntries(revenue.map(row => [row._id || 'unknown', { total: row.total, count: row.count }])),
        daily,
        ridesByCategory: Object.fromEntries(byCategory.map(row => [row._id || 'unknown', row.count])),
    });
}));

// ---------- People (customers, drivers, admins) ----------

const peopleRoles = { customers: 'customer', drivers: 'driver', admins: 'admin' };
const statusByRole = {
    customer: ['active', 'suspended'],
    driver: ['pending', 'approved', 'rejected', 'suspended'],
    admin: ['active', 'suspended'],
};

for (const [path, role] of Object.entries(peopleRoles)) {
    const Model = accountModel(role);

    router.get(`/${path}`, validate({ query: listQuery }), asyncHandler(async (req, res) => {
        const { q, status } = req.validQuery;
        const { page, limit, skip } = paginate(req.validQuery);
        const filter = { ...searchFilter(q, ['fullName', 'username', 'email', 'phoneNumber']), ...(status ? { status } : {}) };
        const [items, total] = await Promise.all([
            Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Model.countDocuments(filter),
        ]);
        res.json({ items, page, limit, total });
    }));

    router.post(`/${path}`, asyncHandler(async (req, res) => {
        const schema = role === 'driver' ? v.driverRegistration : v.customerRegistration;
        const data = schema.parse(req.body);
        const exists = await Model.exists({ $or: [{ email: data.email }, { username: data.username }] }).collation(CASE_INSENSITIVE);
        if (exists) throw conflict('Email or username already in use', 'duplicate');
        const account = await Model.create({
            ...data,
            password: await hashPassword(data.password),
            ...(role === 'driver' ? { status: 'approved' } : {}),
        });
        await audit(req, `${role}.create`, role, account._id);
        res.status(201).json({ item: account });
    }));

    router.patch(`/${path}/:id`, validate({ params: idParams }), asyncHandler(async (req, res) => {
        const schema = z.object({
            ...v.profileFields,
            email: v.email,
            username: v.username,
            status: z.enum(statusByRole[role]),
            password: v.password,
            ...(role === 'driver' ? { drivingLicenseNumber: v.trimmed(6, 30, 'Licence'), vehicle: v.vehicle } : {}),
        }).partial();
        const data = schema.parse(req.body);
        if (role === 'admin' && req.params.id === req.auth.id && data.status === 'suspended') {
            throw badRequest('You cannot suspend your own admin account');
        }
        const account = await Model.findById(req.params.id);
        if (!account) throw notFound(`${role} not found`);

        const { password, ...fields } = data;
        Object.assign(account, fields);
        if (password) account.password = await hashPassword(password);
        // Suspension or a password reset by an admin signs the account out everywhere.
        if (password || fields.status === 'suspended' || fields.status === 'rejected') {
            account.tokenVersion = (account.tokenVersion || 0) + 1;
            if (role === 'driver') account.isOnline = false;
        }
        await account.save();

        if (role === 'driver' && fields.status && ['approved', 'rejected'].includes(fields.status)) {
            await notify({
                recipient: account._id,
                role: 'driver',
                type: `driver.${fields.status}`,
                title: fields.status === 'approved' ? 'You are verified!' : 'Application update',
                body: fields.status === 'approved' ? 'Your driver profile is approved. Go online to start receiving rides.' : 'Your driver application was not approved. Contact support for details.',
            });
        }
        await audit(req, `${role}.update`, role, account._id, { fields: Object.keys(data) });
        res.json({ item: account });
    }));

    router.delete(`/${path}/:id`, validate({ params: idParams }), asyncHandler(async (req, res) => {
        if (role === 'admin' && req.params.id === req.auth.id) throw badRequest('You cannot delete your own admin account');
        const linkField = role === 'customer' ? 'user' : 'driver';
        if (role !== 'admin' && await Booking.exists({ [linkField]: req.params.id })) {
            throw conflict('This account has booking history. Suspend it instead of deleting.', 'has_history');
        }
        const deleted = await Model.findByIdAndDelete(req.params.id);
        if (!deleted) throw notFound(`${role} not found`);
        await audit(req, `${role}.delete`, role, deleted._id);
        res.json({ ok: true });
    }));
}

// ---------- Rental fleet ----------

const carBody = z.object({
    name: v.trimmed(2, 60, 'Name'),
    image: z.string().trim().max(500).refine(url => /^https?:\/\/\S+$/.test(url) || /^\/[\w\-./]+$/.test(url), 'Image must be an http(s) URL or a /path on this site'),
    capacity: z.number().int().min(1).max(12),
    fuelType: z.enum(['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid']),
    rentPerHour: z.number().min(1).max(100000),
    transmission: z.enum(['Manual', 'Automatic']).optional(),
    active: z.boolean().optional(),
});

router.get('/cars', asyncHandler(async (req, res) => {
    res.json({ items: await Car.find().sort({ createdAt: -1 }) });
}));

router.post('/cars', validate({ body: carBody }), asyncHandler(async (req, res) => {
    const car = await Car.create(req.body);
    await audit(req, 'car.create', 'car', car._id);
    res.status(201).json({ item: car });
}));

router.patch('/cars/:id', validate({ params: idParams, body: carBody.partial() }), asyncHandler(async (req, res) => {
    const car = await Car.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!car) throw notFound('Car not found');
    await audit(req, 'car.update', 'car', car._id, { fields: Object.keys(req.body) });
    res.json({ item: car });
}));

router.delete('/cars/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
    // Cars with history are retired rather than deleted, so bookings keep their reference.
    if (await Booking.exists({ car: req.params.id })) {
        await Car.updateOne({ _id: req.params.id }, { $set: { active: false } });
        await audit(req, 'car.retire', 'car', req.params.id);
        return res.json({ ok: true, retired: true });
    }
    const deleted = await Car.findByIdAndDelete(req.params.id);
    if (!deleted) throw notFound('Car not found');
    await audit(req, 'car.delete', 'car', deleted._id);
    return res.json({ ok: true });
}));

// ---------- Bookings ----------

router.get('/bookings', validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const { status, type } = req.validQuery;
    const { page, limit, skip } = paginate(req.validQuery);
    const filter = {};
    if (status && ALL_STATUSES.includes(status)) filter.status = status;
    if (type) filter.type = type;
    const [items, total] = await Promise.all([
        Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .populate('user', 'fullName phoneNumber email')
            .populate('driver', 'fullName phoneNumber vehicle')
            .populate('car', 'name'),
        Booking.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total });
}));

router.get('/bookings/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
    res.json({ booking: await loadForViewer(req.params.id, req.auth) });
}));

router.post('/bookings/:id/complete', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const booking = await transition(req.params.id, 'complete', req.auth, {
        set: current => (current.payment?.method === 'cash' ? { 'payment.status': 'paid', 'payment.paidAt': new Date() } : {}),
    });
    res.json({ booking: await loadForViewer(booking._id, req.auth) });
}));

// ---------- Pricing ----------

router.get('/fares', asyncHandler(async (req, res) => {
    res.json({ items: await FareConfig.find().sort({ sortOrder: 1 }) });
}));

router.patch('/fares/:key', validate({
    params: z.object({ key: z.string().regex(/^[a-z]{2,20}$/) }),
    body: z.object({
        name: v.trimmed(2, 30, 'Name'),
        description: z.string().trim().max(120),
        capacity: z.number().int().min(1).max(12),
        baseFare: z.number().min(0).max(5000),
        perKm: z.number().min(0).max(500),
        perMin: z.number().min(0).max(100),
        minFare: z.number().min(0).max(5000),
        active: z.boolean(),
    }).partial(),
}), asyncHandler(async (req, res) => {
    const item = await FareConfig.findOneAndUpdate({ key: req.params.key }, { $set: req.body }, { new: true, runValidators: true });
    if (!item) throw notFound('Category not found');
    await audit(req, 'fare.update', 'fare', item._id, req.body);
    res.json({ item });
}));

// ---------- Feedback, support, audit ----------

router.get('/feedback', asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const [items, total, avg] = await Promise.all([
        Feedback.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'fullName username').populate('driverId', 'fullName username'),
        Feedback.countDocuments(),
        Feedback.aggregate([{ $group: { _id: null, appRating: { $avg: '$appRating' } } }]),
    ]);
    res.json({ items, page, limit, total, averageAppRating: avg[0]?.appRating ? Math.round(avg[0].appRating * 10) / 10 : null });
}));

router.get('/support', validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const { status } = req.validQuery;
    const { page, limit, skip } = paginate(req.validQuery);
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
        SupportTicket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        SupportTicket.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total });
}));

router.patch('/support/:id', validate({
    params: idParams,
    body: z.object({ status: z.enum(['open', 'in_progress', 'resolved']).optional(), adminReply: z.string().trim().max(2000).optional() }),
}), asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!ticket) throw notFound('Ticket not found');
    if (req.body.adminReply || req.body.status === 'resolved') {
        await notify({
            recipient: ticket.requester,
            role: ticket.requesterRole,
            type: 'support.update',
            title: `Support: ${ticket.subject}`.slice(0, 120),
            body: (req.body.adminReply || 'Your ticket has been resolved.').slice(0, 400),
        });
    }
    await audit(req, 'support.update', 'ticket', ticket._id, { status: req.body.status });
    res.json({ item: ticket });
}));

router.get('/audit', asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const [items, total] = await Promise.all([
        AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(),
    ]);
    res.json({ items, page, limit, total });
}));

module.exports = router;
