const express = require('express');
const { accountModel, CASE_INSENSITIVE, ADMIN_ROLES, Admin } = require('../models/accounts');
const { Booking, ALL_STATUSES } = require('../models/Booking');
const Car = require('../models/Car');
const { FareConfig, Feedback, SupportTicket, AuditLog } = require('../models/misc');
const { FleetOwner, RentalRate, Settings, Payment, PACKAGES } = require('../models/rental');
const { Promo } = require('../models/Promo');
const promos = require('../services/promos');
const rentals = require('../services/rentals');
const ops = require('../services/rentalOps');
const { requireAuth, allowAdmin } = require('../middleware/auth');
const { validate, idParams } = require('../middleware/common');
const { transition } = require('../services/bookings');
const { hashPassword } = require('../services/auth');
const { notify, audit } = require('../services/notify');
const { loadForViewer } = require('./booking');
const { reschedule } = require('./rentals');
const v = require('../validation');
const { asyncHandler, notFound, conflict, badRequest, paginate, escapeRegex } = require('../utils/http');

const router = express.Router();
const { z } = v;

router.use(requireAuth('admin'));

// Who may do what. Reading is open to every admin role; changes are not.
const SUPER = allowAdmin('super');
const OPERATE = allowAdmin('super', 'operations');
const SUPPORT = allowAdmin('super', 'operations', 'support');

const listQuery = z.object({
    q: z.string().trim().max(60).optional(),
    status: z.string().max(20).optional(),
    type: z.enum(['ride', 'rental']).optional(),
    view: z.enum(['pending', 'needs_driver', 'unacknowledged', 'today', 'active', 'upcoming', 'refunds']).optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
});

// Remembers which fields the client actually sent, before validation fills in
// defaults (zod applies defaults even inside .partial()).
const rememberSentKeys = (req, res, next) => {
    req.sentKeys = new Set(Object.keys(req.body || {}));
    next();
};

function searchFilter(q, fields) {
    if (!q) return {};
    const pattern = new RegExp(escapeRegex(q), 'i');
    return { $or: fields.map(field => ({ [field]: pattern })) };
}

const optionalText = max => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const optionalDate = label => z.union([v.isoDate(label), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date`).transform(value => new Date(`${value}T00:00:00+05:30`))])
    .optional().nullable().or(z.literal('').transform(() => null));

// ---------- Dashboard ----------

function startOfIstDay(date = new Date()) {
    const ist = new Date(date.getTime() + 5.5 * 3600e3);
    ist.setUTCHours(0, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 3600e3);
}

router.get('/stats', asyncHandler(async (req, res) => {
    const Users = accountModel('customer');
    const Drivers = accountModel('driver');
    const now = new Date();
    const today = startOfIstDay(now);
    const tomorrow = new Date(today.getTime() + 24 * 3600e3);
    const since = new Date(today.getTime() - 13 * 24 * 3600e3);

    const [customers, drivers, pendingDrivers, onlineDrivers, cars, carsInMaintenance, openTickets, urgentTickets, byStatus, revenue, daily, byCategory, collected, todayPickups, busyCars, busyDrivers, attention, alerts] = await Promise.all([
        Users.countDocuments(),
        Drivers.countDocuments({ status: 'approved' }),
        Drivers.countDocuments({ status: 'pending' }),
        Drivers.countDocuments({ status: 'approved', isOnline: true }),
        Car.countDocuments({ active: true }),
        Car.countDocuments({ active: true, maintenance: true }),
        SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
        SupportTicket.countDocuments({ status: { $ne: 'resolved' }, priority: 'urgent' }),
        Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Booking.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$type', total: { $sum: { $ifNull: ['$finalAmount', '$totalAmount'] } }, count: { $sum: 1 } } }]),
        Booking.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
                    bookings: { $sum: 1 },
                    completedRevenue: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$finalAmount', '$totalAmount'] }, 0] } },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        Booking.aggregate([{ $match: { type: 'rental', rentalType: { $exists: true } } }, { $group: { _id: '$rentalType', count: { $sum: 1 } } }]),
        Payment.aggregate([{ $group: { _id: '$kind', total: { $sum: '$amount' } } }]),
        Booking.countDocuments({ type: 'rental', start: { $gte: today, $lt: tomorrow }, status: { $in: rentals.OPEN_STATUSES.concat('completed') } }),
        // "Busy" = on a trip right now (between pickup and the end of the reservation).
        Booking.distinct('car', { type: 'rental', status: { $in: ['confirmed', 'arrived', 'in_progress'] }, start: { $lte: now }, blockEnd: { $gt: now } }),
        Booking.distinct('driver', { type: 'rental', status: { $in: ['confirmed', 'arrived', 'in_progress'] }, start: { $lte: now }, blockEnd: { $gt: now } }),
        Promise.all([
            Booking.countDocuments({ type: 'rental', status: 'pending_approval' }),
            Booking.countDocuments({ type: 'rental', status: 'confirmed', driver: null }),
            Booking.countDocuments({ type: 'rental', status: 'confirmed', driver: { $ne: null }, 'assignment.acknowledgedAt': null, start: { $lt: new Date(now.getTime() + 24 * 3600e3) } }),
            Booking.countDocuments({ type: 'rental', 'payment.status': { $in: ['refund_pending', 'partially_refunded'] } }),
        ]),
        rentals.complianceAlerts(30, now),
    ]);

    const paid = collected.find(row => row._id === 'payment')?.total || 0;
    const refunded = collected.find(row => row._id === 'refund')?.total || 0;
    const statuses = Object.fromEntries(byStatus.map(row => [row._id || 'unknown', row.count]));
    res.json({
        totals: {
            customers, drivers, pendingDrivers, onlineDrivers, cars, carsInMaintenance, openTickets, urgentTickets,
            todayPickups,
            busyCars: busyCars.filter(Boolean).length,
            availableCars: Math.max(0, cars - carsInMaintenance - busyCars.filter(Boolean).length),
            busyDrivers: busyDrivers.filter(Boolean).length,
            availableDrivers: Math.max(0, drivers - busyDrivers.filter(Boolean).length),
            collected: paid - refunded,
        },
        attention: { pendingApproval: attention[0], needsDriver: attention[1], unacknowledged: attention[2], refundsDue: attention[3] },
        bookingsByStatus: statuses,
        revenue: Object.fromEntries(revenue.map(row => [row._id || 'unknown', { total: row.total, count: row.count }])),
        daily,
        rentalsByType: Object.fromEntries(byCategory.map(row => [row._id || 'unknown', row.count])),
        complianceAlerts: alerts.slice(0, 20),
        complianceAlertCount: alerts.length,
    });
}));

// ---------- People (customers, drivers, admins) ----------

const peopleRoles = { customers: 'customer', drivers: 'driver', admins: 'admin' };
const statusByRole = {
    customer: ['active', 'suspended'],
    driver: ['pending', 'approved', 'rejected', 'suspended'],
    admin: ['active', 'suspended'],
};

const driverCompliance = {
    licenseExpiry: optionalDate('Licence expiry'),
    policeVerification: z.object({
        status: z.enum(['pending', 'verified', 'failed']),
        verifiedOn: optionalDate('Verified on'),
        reference: optionalText(60),
    }),
    emergencyContact: z.object({ name: optionalText(60), phone: optionalText(15) }),
};

// The last active super admin can never be demoted, suspended or deleted.
async function assertAnotherSuperAdmin(exceptId) {
    const others = await Admin.countDocuments({ _id: { $ne: exceptId }, status: 'active', adminRole: { $in: ['super', null] } });
    if (!others) throw badRequest('There must always be at least one active super admin');
}

for (const [path, role] of Object.entries(peopleRoles)) {
    const Model = accountModel(role);
    // Only super admins see or manage the admin team.
    const read = role === 'admin' ? SUPER : SUPPORT;
    const write = role === 'admin' ? SUPER : OPERATE;

    router.get(`/${path}`, read, validate({ query: listQuery }), asyncHandler(async (req, res) => {
        const { q, status } = req.validQuery;
        const { page, limit, skip } = paginate(req.validQuery);
        const filter = { ...searchFilter(q, ['fullName', 'username', 'email', 'phoneNumber']), ...(status ? { status } : {}) };
        const [items, total] = await Promise.all([
            Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Model.countDocuments(filter),
        ]);
        res.json({ items, page, limit, total });
    }));

    router.post(`/${path}`, write, asyncHandler(async (req, res) => {
        let schema = role === 'driver' ? v.driverRegistration : v.customerRegistration;
        if (role === 'admin') schema = schema.extend({ adminRole: z.enum(ADMIN_ROLES, { error: 'Choose an admin role' }) });
        const data = schema.parse(req.body);
        const exists = await Model.exists({ $or: [{ email: data.email }, { username: data.username }] }).collation(CASE_INSENSITIVE);
        if (exists) throw conflict('Email or username already in use', 'duplicate');
        const account = await Model.create({
            ...data,
            password: await hashPassword(data.password),
            // Drivers added by operations are vetted offline; compliance fields still gate assignment.
            ...(role === 'driver' ? { status: 'approved' } : {}),
        });
        await audit(req, `${role}.create`, role, account._id, role === 'admin' ? { adminRole: account.adminRole } : undefined);
        res.status(201).json({ item: account });
    }));

    router.patch(`/${path}/:id`, write, validate({ params: idParams }), asyncHandler(async (req, res) => {
        const schema = z.object({
            ...v.profileFields,
            email: v.email,
            username: v.username,
            status: z.enum(statusByRole[role]),
            password: v.password,
            ...(role === 'driver' ? { drivingLicenseNumber: v.trimmed(6, 30, 'Licence'), vehicle: v.vehicle, ...driverCompliance } : {}),
            ...(role === 'admin' ? { adminRole: z.enum(ADMIN_ROLES) } : {}),
        }).partial();
        const data = schema.parse(req.body);
        if (!Object.keys(data).length) throw badRequest('Nothing to update');
        const self = role === 'admin' && req.params.id === req.auth.id;
        if (self && data.status === 'suspended') throw badRequest('You cannot suspend your own admin account');
        if (self && data.adminRole && data.adminRole !== req.auth.adminRole) throw badRequest('You cannot change your own admin role');
        const account = await Model.findById(req.params.id);
        if (!account) throw notFound(`${role} not found`);
        if (role === 'admin' && (account.adminRole || 'super') === 'super' && ((data.adminRole && data.adminRole !== 'super') || data.status === 'suspended')) {
            await assertAnotherSuperAdmin(account._id);
        }

        const { password, policeVerification, ...fields } = data;
        Object.assign(account, fields);
        if (policeVerification) {
            account.policeVerification = {
                ...policeVerification,
                verifiedOn: policeVerification.status === 'verified' ? (policeVerification.verifiedOn || account.policeVerification?.verifiedOn || new Date()) : undefined,
            };
        }
        if (password) account.password = await hashPassword(password);
        // Suspension, a role change or a password reset by an admin signs the account out everywhere.
        if (password || fields.status === 'suspended' || fields.status === 'rejected' || fields.adminRole) {
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
                body: fields.status === 'approved' ? 'Your chauffeur profile is approved. Trips assigned to you will appear on your dashboard.' : 'Your driver application was not approved. Contact support for details.',
            });
        }
        await audit(req, `${role}.update`, role, account._id, { fields: Object.keys(data) });
        res.json({ item: account });
    }));

    router.delete(`/${path}/:id`, write, validate({ params: idParams }), asyncHandler(async (req, res) => {
        if (role === 'admin' && req.params.id === req.auth.id) throw badRequest('You cannot delete your own admin account');
        const linkField = role === 'customer' ? 'user' : 'driver';
        if (role !== 'admin' && await Booking.exists({ [linkField]: req.params.id })) {
            throw conflict('This account has booking history. Suspend it instead of deleting.', 'has_history');
        }
        if (role === 'admin') {
            const target = await Admin.findById(req.params.id).lean();
            if (target && (target.adminRole || 'super') === 'super') await assertAnotherSuperAdmin(target._id);
        }
        const deleted = await Model.findByIdAndDelete(req.params.id);
        if (!deleted) throw notFound(`${role} not found`);
        await audit(req, `${role}.delete`, role, deleted._id);
        res.json({ ok: true });
    }));
}

// ---------- Fleet: cars and owners ----------

const documentBody = z.object({ number: optionalText(40), expiresOn: optionalDate('Expiry date') });

const carBody = z.object({
    name: v.trimmed(2, 60, 'Name'),
    image: z.string().trim().max(500).refine(url => /^https?:\/\/\S+$/.test(url) || /^\/[\w\-./]+$/.test(url), 'Image must be an http(s) URL or a /path on this site'),
    category: z.enum(Car.VEHICLE_CLASSES).default('sedan'),
    registrationNumber: z.string().trim().toUpperCase().transform(value => value.replace(/\s+/g, ' '))
        .refine(value => /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/.test(value), 'Enter a valid registration number, e.g. UP65 AB 1234').optional(),
    capacity: z.number().int().min(1).max(12),
    luggage: z.number().int().min(0).max(10).optional(),
    ac: z.boolean().optional(),
    fuelType: z.enum(['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid']),
    transmission: z.enum(['Manual', 'Automatic']).optional(),
    rentPerHour: z.number().min(0).max(100000).optional(),
    owner: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid owner').nullable().optional(),
    documents: z.object(Object.fromEntries(Car.DOCUMENT_TYPES.map(key => [key, documentBody]))).partial().optional(),
    maintenance: z.boolean().optional(),
    active: z.boolean().optional(),
});

// Flattens nested document fields so a partial update never wipes sibling documents.
function carUpdate(body) {
    const { documents, ...rest } = body;
    const set = { ...rest };
    for (const [key, doc] of Object.entries(documents || {})) {
        if (doc.number !== undefined) set[`documents.${key}.number`] = doc.number;
        if (doc.expiresOn !== undefined) set[`documents.${key}.expiresOn`] = doc.expiresOn;
    }
    return set;
}

async function assertOwner(ownerId) {
    if (ownerId && !(await FleetOwner.exists({ _id: ownerId }))) throw badRequest('Fleet owner not found');
}

router.get('/cars', SUPPORT, asyncHandler(async (req, res) => {
    const now = new Date();
    const items = await Car.find().sort({ active: -1, category: 1, name: 1 }).populate('owner', 'name type').lean();
    res.json({ items: items.map(car => ({ ...car, issue: rentals.vehicleIssue(car, now) })) });
}));

router.post('/cars', OPERATE, validate({ body: carBody }), asyncHandler(async (req, res) => {
    await assertOwner(req.body.owner);
    const car = await Car.create(req.body);
    await audit(req, 'car.create', 'car', car._id);
    res.status(201).json({ item: car });
}));

router.patch('/cars/:id', OPERATE, rememberSentKeys, validate({ params: idParams, body: carBody.partial() }), asyncHandler(async (req, res) => {
    await assertOwner(req.body.owner);
    // The partial schema still applies defaults; only keep keys that were sent.
    const sent = Object.fromEntries(Object.entries(req.body).filter(([key, value]) => value !== undefined && req.sentKeys.has(key)));
    if (!Object.keys(sent).length) throw badRequest('Nothing to update');
    const car = await Car.findByIdAndUpdate(req.params.id, { $set: carUpdate(sent) }, { new: true, runValidators: true });
    if (!car) throw notFound('Car not found');
    await audit(req, 'car.update', 'car', car._id, { fields: Object.keys(sent) });
    res.json({ item: car });
}));

router.delete('/cars/:id', OPERATE, validate({ params: idParams }), asyncHandler(async (req, res) => {
    // Cars with history are retired rather than deleted, so bookings keep their reference.
    if (await Booking.exists({ car: req.params.id })) {
        const open = await Booking.exists({ car: req.params.id, status: { $in: rentals.OPEN_STATUSES } });
        if (open) throw conflict('This car has upcoming bookings. Move them to another car first.', 'has_bookings');
        await Car.updateOne({ _id: req.params.id }, { $set: { active: false } });
        await audit(req, 'car.retire', 'car', req.params.id);
        return res.json({ ok: true, retired: true });
    }
    const deleted = await Car.findByIdAndDelete(req.params.id);
    if (!deleted) throw notFound('Car not found');
    await audit(req, 'car.delete', 'car', deleted._id);
    return res.json({ ok: true });
}));

const ownerBody = z.object({
    name: v.trimmed(2, 80, 'Name'),
    type: z.enum(['company', 'partner']),
    phone: z.union([v.phone, z.literal('').transform(() => undefined)]).optional(),
    email: z.union([v.email, z.literal('').transform(() => undefined)]).optional(),
    address: optionalText(200),
    agreement: z.object({
        reference: optionalText(60),
        startsOn: optionalDate('Agreement start'),
        endsOn: optionalDate('Agreement end'),
        commissionPercent: z.number().min(0).max(100).optional(),
        notes: optionalText(500),
    }).optional(),
    active: z.boolean().optional(),
});

function checkAgreement(agreement) {
    if (agreement?.startsOn && agreement?.endsOn && agreement.endsOn <= agreement.startsOn) throw badRequest('Agreement end must be after its start');
}

router.get('/owners', SUPPORT, asyncHandler(async (req, res) => {
    const [owners, counts] = await Promise.all([
        FleetOwner.find().sort({ active: -1, name: 1 }).lean(),
        Car.aggregate([{ $match: { active: true, owner: { $ne: null } } }, { $group: { _id: '$owner', cars: { $sum: 1 } } }]),
    ]);
    const byOwner = Object.fromEntries(counts.map(row => [row._id.toString(), row.cars]));
    res.json({ items: owners.map(owner => ({ ...owner, cars: byOwner[owner._id.toString()] || 0 })) });
}));

router.post('/owners', OPERATE, validate({ body: ownerBody }), asyncHandler(async (req, res) => {
    checkAgreement(req.body.agreement);
    const item = await FleetOwner.create(req.body);
    await audit(req, 'owner.create', 'owner', item._id);
    res.status(201).json({ item });
}));

router.patch('/owners/:id', OPERATE, validate({ params: idParams, body: ownerBody.partial() }), asyncHandler(async (req, res) => {
    checkAgreement(req.body.agreement);
    if (req.body.active === false && await Car.exists({ owner: req.params.id, active: true })) {
        throw conflict('This owner still has active cars. Retire or move them first.', 'has_cars');
    }
    const item = await FleetOwner.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!item) throw notFound('Owner not found');
    await audit(req, 'owner.update', 'owner', item._id, { fields: Object.keys(req.body) });
    res.json({ item });
}));

router.get('/compliance', SUPPORT, asyncHandler(async (req, res) => {
    res.json({ items: await rentals.complianceAlerts(30) });
}));

// ---------- Bookings ----------

function bookingViewFilter(view, now = new Date()) {
    const today = startOfIstDay(now);
    switch (view) {
        case 'pending': return { type: 'rental', status: 'pending_approval' };
        case 'needs_driver': return { type: 'rental', status: 'confirmed', driver: null };
        case 'unacknowledged': return { type: 'rental', status: 'confirmed', driver: { $ne: null }, 'assignment.acknowledgedAt': null };
        case 'today': return { type: 'rental', start: { $gte: today, $lt: new Date(today.getTime() + 24 * 3600e3) } };
        case 'active': return { status: { $in: ['arrived', 'in_progress', 'accepted', 'requested'] } };
        case 'upcoming': return { type: 'rental', status: { $in: ['pending_approval', 'confirmed'] }, start: { $gte: now } };
        case 'refunds': return { type: 'rental', 'payment.status': { $in: ['refund_pending', 'partially_refunded'] } };
        default: return {};
    }
}

router.get('/bookings', SUPPORT, validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const { status, type, view, q } = req.validQuery;
    const { page, limit, skip } = paginate(req.validQuery);
    const filter = bookingViewFilter(view);
    if (status && ALL_STATUSES.includes(status)) filter.status = status;
    if (type) filter.type = type;
    if (q) {
        const pattern = new RegExp(escapeRegex(q), 'i');
        const users = await accountModel('customer').find({ $or: [{ fullName: pattern }, { phoneNumber: pattern }, { email: pattern }] }).select('_id').limit(50).lean();
        filter.$or = [{ reference: pattern }, { user: { $in: users.map(user => user._id) } }];
    }
    // Upcoming work is easiest to scan by pickup time; everything else newest first.
    const sort = ['pending', 'needs_driver', 'unacknowledged', 'today', 'upcoming'].includes(view) ? { start: 1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
        Booking.find(filter).sort(sort).skip(skip).limit(limit)
            .populate('user', 'fullName phoneNumber email')
            .populate('driver', 'fullName phoneNumber vehicle')
            .populate('car', 'name registrationNumber category'),
        Booking.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total });
}));

router.get('/bookings/:id', SUPPORT, validate({ params: idParams }), asyncHandler(async (req, res) => {
    const [booking, payments] = await Promise.all([
        loadForViewer(req.params.id, req.auth),
        Payment.find({ booking: req.params.id }).sort({ createdAt: 1 }).lean(),
    ]);
    res.json({ booking, payments });
}));

router.get('/bookings/:id/candidates', OPERATE, validate({ params: idParams }), asyncHandler(async (req, res) => {
    res.json(await ops.candidates(req.params.id));
}));

const respond = async (req, res, booking, action, meta) => {
    await audit(req, `booking.${action}`, 'booking', booking._id, meta);
    const [full, payments] = await Promise.all([
        loadForViewer(booking._id, req.auth),
        Payment.find({ booking: booking._id }).sort({ createdAt: 1 }).lean(),
    ]);
    res.json({ booking: full, payments });
};

const objectIdString = label => z.string().regex(/^[a-f\d]{24}$/i, `Choose a ${label}`);

router.post('/bookings/:id/approve', OPERATE, validate({
    params: idParams,
    body: z.object({ driverId: objectIdString('driver'), carId: objectIdString('car').optional() }),
}), asyncHandler(async (req, res) => {
    const booking = await ops.approve(req.params.id, req.auth, req.body);
    await respond(req, res, booking, 'approve', { driver: req.body.driverId, car: booking.car });
}));

router.post('/bookings/:id/reject', OPERATE, validate({
    params: idParams,
    body: z.object({ reason: v.trimmed(5, 300, 'Reason') }),
}), asyncHandler(async (req, res) => {
    const booking = await ops.reject(req.params.id, req.auth, req.body.reason);
    await respond(req, res, booking, 'reject', { reason: req.body.reason });
}));

router.post('/bookings/:id/assign-driver', OPERATE, validate({
    params: idParams,
    body: z.object({ driverId: objectIdString('driver') }),
}), asyncHandler(async (req, res) => {
    const booking = await ops.assignDriver(req.params.id, req.auth, req.body.driverId);
    await respond(req, res, booking, 'assign_driver', { driver: req.body.driverId });
}));

router.post('/bookings/:id/change-car', OPERATE, validate({
    params: idParams,
    body: z.object({ carId: objectIdString('car') }),
}), asyncHandler(async (req, res) => {
    const booking = await ops.changeCar(req.params.id, req.auth, req.body.carId);
    await respond(req, res, booking, 'change_car', { car: req.body.carId });
}));

router.post('/bookings/:id/reschedule', OPERATE, validate({
    params: idParams,
    body: z.object({ start: v.isoDate('New pickup time') }),
}), asyncHandler(async (req, res) => {
    const booking = await reschedule(req.params.id, req.body.start, req.auth, await rentals.getSettings());
    await respond(req, res, booking, 'reschedule', { start: booking.start });
}));

router.post('/bookings/:id/payments', OPERATE, validate({
    params: idParams,
    body: z.object({
        kind: z.enum(['payment', 'refund']),
        amount: z.number({ error: 'Enter an amount' }).int('Use whole rupees').min(1, 'Amount must be at least ₹1').max(500000),
        method: z.enum(['cash', 'upi', 'bank']),
        reference: optionalText(60),
        note: optionalText(200),
    }),
}), asyncHandler(async (req, res) => {
    const me = await Admin.findById(req.auth.id).select('fullName').lean();
    await ops.recordPayment(req.params.id, req.auth, req.body, me?.fullName);
    const booking = await Booking.findById(req.params.id);
    await respond(req, res, booking, `payment_${req.body.kind}`, { amount: req.body.amount, method: req.body.method });
}));

// Admin override when the driver cannot close the trip from the app.
router.post('/bookings/:id/complete', OPERATE, validate({
    params: idParams,
    body: z.object({
        actualKm: z.number().min(0).max(5000).optional(),
        endOdometer: z.number().min(0).max(9999999).optional(),
        tolls: z.number().min(0).max(50000).default(0),
        parking: z.number().min(0).max(10000).default(0),
    }),
}), asyncHandler(async (req, res) => {
    const current = await Booking.findById(req.params.id).select('type rentalType').lean();
    if (!current) throw notFound('Booking not found');
    let booking;
    if (current.type === 'rental' && current.rentalType) {
        booking = await ops.completeRental(req.params.id, req.auth, req.body);
    } else {
        booking = await transition(req.params.id, 'complete', req.auth, {
            set: existing => (existing.payment?.method === 'cash' ? { 'payment.status': 'paid', 'payment.paidAt': new Date() } : {}),
        });
    }
    await respond(req, res, booking, 'complete');
}));

// ---------- Pricing: rental rate cards, ride fares ----------

router.get('/rates', SUPPORT, asyncHandler(async (req, res) => {
    res.json({ items: await RentalRate.find().sort({ vehicleClass: 1 }).lean(), packages: PACKAGES });
}));

const money = max => z.number().min(0).max(max);

router.patch('/rates/:vehicleClass', SUPER, validate({
    params: z.object({ vehicleClass: z.enum(Car.VEHICLE_CLASSES) }),
    body: z.object({
        label: v.trimmed(2, 40, 'Label'),
        packages: z.array(z.object({ key: z.enum(PACKAGES.map(pkg => pkg.key)), price: money(100000) })).max(PACKAGES.length),
        extraKmRate: money(200),
        extraHourRate: money(2000),
        outstation: z.object({ perKm: money(200), minKmPerDay: money(1000), oneWayMinKm: money(1000), driverAllowancePerDay: money(5000), nightCharge: money(5000) }),
        airport: z.object({ fare: money(20000), includedKm: money(200), includedHours: z.number().min(1).max(12) }),
        active: z.boolean(),
    }).partial(),
}), asyncHandler(async (req, res) => {
    const { packages, outstation, airport, ...rest } = req.body;
    const set = { ...rest };
    // Nested objects are merged field by field so a partial edit keeps the other rates.
    for (const [group, values] of Object.entries({ outstation, airport })) {
        for (const [key, value] of Object.entries(values || {})) set[`${group}.${key}`] = value;
    }
    const current = await RentalRate.findOne({ vehicleClass: req.params.vehicleClass });
    if (!current) throw notFound('Rate card not found');
    if (packages) {
        const prices = Object.fromEntries(current.packages.map(item => [item.key, item.price]));
        for (const item of packages) prices[item.key] = item.price;
        set.packages = PACKAGES.map(pkg => ({ key: pkg.key, price: prices[pkg.key] ?? 0 }));
    }
    const item = await RentalRate.findByIdAndUpdate(current._id, { $set: set }, { new: true, runValidators: true });
    await audit(req, 'rates.update', 'rates', item._id, req.body);
    res.json({ item });
}));

router.get('/fares', SUPPORT, asyncHandler(async (req, res) => {
    res.json({ items: await FareConfig.find().sort({ sortOrder: 1 }) });
}));

router.patch('/fares/:key', SUPER, validate({
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

// ---------- Settings ----------

router.get('/settings', SUPPORT, asyncHandler(async (req, res) => {
    res.json({ item: await rentals.getSettings() });
}));

router.patch('/settings', SUPER, validate({
    body: z.object({
        gstPercent: z.number().min(0).max(28),
        bufferMinutes: z.number().int().min(0).max(360),
        minLeadHours: z.number().min(0).max(72),
        maxAdvanceDays: z.number().int().min(1).max(180),
        cancellation: z.object({
            freeHours: z.number().min(0).max(168),
            partialHours: z.number().min(0).max(168),
            partialRefundPercent: z.number().int().min(0).max(100),
        }),
        upiId: z.union([z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID, e.g. rideit@okaxis'), z.literal('')]),
        supportPhone: z.union([v.phone, z.literal('')]),
        supportEmail: z.union([v.email, z.literal('')]),
        exclusions: z.string().trim().max(400),
    }).partial(),
}), asyncHandler(async (req, res) => {
    const current = await rentals.getSettings();
    const cancellation = { ...current.cancellation, ...(req.body.cancellation || {}) };
    if (cancellation.partialHours > cancellation.freeHours) throw badRequest('The partial-refund window must be shorter than the free-cancellation window');
    const { cancellation: ignored, ...rest } = req.body;
    const item = await Settings.findOneAndUpdate({ key: 'global' }, { $set: { ...rest, cancellation } }, { new: true, runValidators: true }).lean();
    await audit(req, 'settings.update', 'settings', item._id, req.body);
    res.json({ item });
}));

// ---------- Promo codes (instant rides) ----------

const promoBody = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Code must be 3-20 letters or digits'),
    description: z.string().trim().max(160).default(''),
    kind: z.enum(['percent', 'flat']),
    value: z.number().positive('Value must be more than 0'),
    maxDiscount: z.number().min(0).default(0),
    minFare: z.number().min(0).default(0),
    categories: z.array(z.string().regex(/^[a-z]{2,20}$/)).max(10).default([]),
    validFrom: v.isoDate('Valid from').optional(),
    validUntil: v.isoDate('Valid until'),
    usageLimit: z.number().int().min(0).default(0),
    perUserLimit: z.number().int().min(1).max(20).default(1),
    public: z.boolean().default(true),
    active: z.boolean().default(true),
});

function checkPromo(promo) {
    if (promo.kind === 'percent' && promo.value > 90) throw badRequest('A percentage discount can be at most 90%');
    if (promo.kind === 'flat' && promo.value > 5000) throw badRequest('A flat discount can be at most ₹5000');
    const from = promo.validFrom ? new Date(promo.validFrom) : new Date();
    if (new Date(promo.validUntil) <= from) throw badRequest('"Valid until" must be after "valid from"');
}

router.get('/promos', SUPER, asyncHandler(async (req, res) => {
    res.json({ items: await Promo.find().sort({ createdAt: -1 }).limit(100) });
}));

router.post('/promos', SUPER, validate({ body: promoBody }), asyncHandler(async (req, res) => {
    checkPromo(req.body);
    const item = await Promo.create(req.body).catch(promos.assertUniqueCodeError);
    await audit(req, 'promo.create', 'promo', item._id, { code: item.code });
    res.status(201).json({ item });
}));

router.patch('/promos/:id', SUPER, rememberSentKeys, validate({
    params: idParams,
    // The code itself is fixed once created; riders may already have it.
    body: promoBody.omit({ code: true }).partial(),
}), asyncHandler(async (req, res) => {
    const current = await Promo.findById(req.params.id).lean();
    if (!current) throw notFound('Promo not found');
    // Defaults from the create schema must not overwrite stored values on a partial update.
    const changes = Object.fromEntries(Object.entries(req.body).filter(([key]) => req.sentKeys.has(key)));
    if (!Object.keys(changes).length) throw badRequest('Nothing to update');
    checkPromo({ ...current, ...changes });
    const item = await Promo.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true, runValidators: true });
    await audit(req, 'promo.update', 'promo', item._id, changes);
    res.json({ item });
}));

// ---------- Feedback, support, audit ----------

router.get('/feedback', SUPPORT, asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const [items, total, avg, ratings] = await Promise.all([
        Feedback.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'fullName username').populate('driverId', 'fullName username'),
        Feedback.countDocuments(),
        Feedback.aggregate([{ $group: { _id: null, appRating: { $avg: '$appRating' } } }]),
        // Trip ratings live on bookings; low scores are listed for follow-up.
        Booking.find({ 'ratingByCustomer.score': { $exists: true } }).sort({ 'ratingByCustomer.at': -1 }).limit(20)
            .select('reference type ratingByCustomer driver user').populate('driver', 'fullName').populate('user', 'fullName').lean(),
    ]);
    res.json({ items, page, limit, total, averageAppRating: avg[0]?.appRating ? Math.round(avg[0].appRating * 10) / 10 : null, tripRatings: ratings });
}));

router.get('/support', SUPPORT, validate({ query: listQuery }), asyncHandler(async (req, res) => {
    const { status } = req.validQuery;
    const { page, limit, skip } = paginate(req.validQuery);
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
        // Urgent tickets (SOS, breakdowns) that are still open always come first.
        SupportTicket.aggregate([
            { $match: filter },
            { $addFields: { _urgentOpen: { $cond: [{ $and: [{ $eq: ['$priority', 'urgent'] }, { $ne: ['$status', 'resolved'] }] }, 1, 0] } } },
            { $sort: { _urgentOpen: -1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: { _urgentOpen: 0, __v: 0 } },
        ]),
        SupportTicket.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total });
}));

router.patch('/support/:id', SUPPORT, validate({
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

router.get('/audit', SUPER, asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const [items, total] = await Promise.all([
        AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(),
    ]);
    res.json({ items, page, limit, total });
}));

module.exports = router;
