const express = require('express');
const jwt = require('jsonwebtoken');
const { config } = require('../../config/env');
const { accountModel, CASE_INSENSITIVE } = require('../accounts/account.model');
const { requireAuth, resolveAuth } = require('../../core/middleware/auth.middleware');
const { validate, limiter } = require('../../core/middleware/request.middleware');
const v = require('../../core/validation');
const authService = require('./auth.service');
const { sendMail } = require('../notifications/mailer.service');
const { recordAudit } = require('../audit/audit.service');
const { asyncHandler, unauthorized, badRequest, conflict, forbidden } = require('../../core/http');

const router = express.Router();
const { z } = v;

const loginRole = z.enum(['customer', 'driver', 'admin']);

// Per-account limit (IP + identifier) plus a looser per-IP limit, so a shared
// proxy IP cannot lock everyone out while brute force is still capped.
const loginLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    keyGenerator: req => `${req.ip}:${String(req.body?.identifier || '').toLowerCase()}`,
    message: 'Too many sign-in attempts. Try again in 15 minutes.',
});
// Independent of IP, so it holds even if proxy headers are misconfigured or spoofed.
const accountLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator: req => `acct:${String(req.body?.role || '')}:${String(req.body?.identifier || '').toLowerCase()}`,
    message: 'Too many sign-in attempts for this account. Try again in 15 minutes.',
});
const authIpLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 100 });

async function findByIdentifier(role, identifier) {
    const Model = accountModel(role);
    const field = identifier.includes('@') ? 'email' : 'username';
    return Model.findOne({ [field]: identifier }).collation(CASE_INSENSITIVE).select('+password');
}

function sessionResponse(account, role) {
    return { account: { ...account.toJSON(), role } };
}

router.post('/register', authIpLimiter, asyncHandler(async (req, res) => {
    const role = z.enum(['customer', 'driver']).parse(req.body?.role);
    const data = (role === 'driver' ? v.driverRegistration : v.customerRegistration).parse(req.body);
    const Model = accountModel(role);

    const existing = await Model.findOne({ $or: [{ email: data.email }, { username: data.username }] }).collation(CASE_INSENSITIVE).lean();
    if (existing) {
        throw conflict(existing.email.toLowerCase() === data.email ? 'An account with this email already exists' : 'This username is taken', 'duplicate');
    }

    const account = await Model.create({ ...data, password: await authService.hashPassword(data.password) });
    await recordAudit({ auth: { id: account._id, role } }, 'account.register', role, account._id);

    if (role === 'driver') {
        // Drivers wait for admin verification before they can sign in to take rides.
        return res.status(201).json({ ...sessionResponse(account, role), pendingApproval: true });
    }
    authService.issueSession(res, account, role);
    return res.status(201).json(sessionResponse(account, role));
}));

router.post('/login', authIpLimiter, accountLimiter, loginLimiter, validate({
    body: z.object({ role: loginRole, identifier: z.string().trim().min(1, 'Enter your username or email').max(120), password: z.string().min(1, 'Enter your password').max(200) }),
}), asyncHandler(async (req, res) => {
    const { role, identifier, password } = req.body;
    const account = await findByIdentifier(role, identifier);
    const valid = await authService.verifyPassword(account, password);
    if (!valid) throw unauthorized('Incorrect username/email or password');

    if (account.status === 'suspended') throw forbidden('Your account is suspended. Contact support.');
    if (role === 'driver' && account.status === 'rejected') throw forbidden('Your driver application was not approved. Contact support.');

    authService.issueSession(res, account, role);
    await recordAudit({ auth: { id: account._id, role } }, 'account.login', role, account._id);
    res.json(sessionResponse(account, role));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
    const token = req.cookies?.[authService.REFRESH_COOKIE];
    if (!token) throw unauthorized('No active session');
    let payload;
    try {
        payload = jwt.verify(token, config.jwtRefreshSecret);
    } catch (error) {
        authService.clearSession(res);
        throw unauthorized('Your session has expired');
    }
    const account = await accountModel(payload.role).findById(payload.sub);
    if (!account || (account.tokenVersion || 0) !== payload.tv || payload.typ !== 'refresh') {
        authService.clearSession(res);
        throw unauthorized('Your session is no longer valid');
    }
    if (account.status === 'suspended') {
        authService.clearSession(res);
        throw forbidden('Your account is suspended. Contact support.');
    }
    authService.issueSession(res, account, payload.role);
    res.json(sessionResponse(account, payload.role));
}));

router.post('/logout', (req, res) => {
    authService.clearSession(res);
    res.json({ ok: true });
});

router.post('/logout-all', requireAuth(), asyncHandler(async (req, res) => {
    await accountModel(req.auth.role).updateOne({ _id: req.auth.id }, { $inc: { tokenVersion: 1 } });
    authService.clearSession(res);
    res.json({ ok: true });
}));

// Session probe for the SPA: never 401s. Signed-out visitors get { account: null };
// an expired access cookie is renewed from a valid refresh cookie.
router.get('/session', asyncHandler(async (req, res) => {
    let auth = null;
    try {
        auth = await resolveAuth(req);
    } catch (error) {
        auth = null;
    }
    if (auth) {
        const account = await accountModel(auth.role).findById(auth.id);
        return res.json(account ? sessionResponse(account, auth.role) : { account: null });
    }
    const token = req.cookies?.[authService.REFRESH_COOKIE];
    if (token) {
        try {
            const payload = jwt.verify(token, config.jwtRefreshSecret);
            const account = await accountModel(payload.role).findById(payload.sub);
            if (payload.typ === 'refresh' && account && (account.tokenVersion || 0) === payload.tv && account.status !== 'suspended') {
                authService.issueSession(res, account, payload.role);
                return res.json(sessionResponse(account, payload.role));
            }
        } catch (error) {
            // fall through to signed-out
        }
        authService.clearSession(res);
    }
    return res.json({ account: null });
}));

router.get('/me', requireAuth(), asyncHandler(async (req, res) => {
    const account = await accountModel(req.auth.role).findById(req.auth.id);
    res.json(sessionResponse(account, req.auth.role));
}));

router.get('/socket-token', requireAuth(), (req, res) => {
    res.json({ token: authService.signSocketToken(req.auth) });
});

router.post('/change-password', requireAuth(), validate({
    body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: v.password }),
}), asyncHandler(async (req, res) => {
    const account = await accountModel(req.auth.role).findById(req.auth.id).select('+password');
    if (!(await authService.verifyPassword(account, req.body.currentPassword))) {
        throw badRequest('Current password is incorrect');
    }
    account.password = await authService.hashPassword(req.body.newPassword);
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();
    authService.issueSession(res, account, req.auth.role);
    await recordAudit(req, 'account.password_changed', req.auth.role, account._id);
    res.json({ ok: true });
}));

const resetLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 5, message: 'Too many reset requests. Try again later.' });

router.post('/forgot-password', resetLimiter, validate({
    body: z.object({ role: loginRole, email: v.email }),
}), asyncHandler(async (req, res) => {
    const { role, email } = req.body;
    const account = await accountModel(role).findOne({ email }).collation(CASE_INSENSITIVE);
    if (account) {
        const { token, hash, expires } = authService.createResetToken();
        account.resetPasswordHash = hash;
        account.resetPasswordExpires = expires;
        await account.save();
        const link = `${config.appUrl}/reset-password?token=${token}&role=${role}`;
        await sendMail({
            to: account.email,
            subject: 'Reset your RIDE-IT password',
            text: `Hi ${account.fullName},\n\nUse this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
        });
    }
    // Same answer either way so the endpoint cannot be used to find accounts.
    res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
}));

router.post('/reset-password', resetLimiter, validate({
    body: z.object({ role: loginRole, token: z.string().regex(/^[a-f\d]{64}$/, 'Invalid reset link'), password: v.password }),
}), asyncHandler(async (req, res) => {
    const { role, token, password } = req.body;
    const account = await accountModel(role).findOne({
        resetPasswordHash: authService.hashResetToken(token),
        resetPasswordExpires: { $gt: new Date() },
    });
    if (!account) throw badRequest('This reset link is invalid or has expired');
    account.password = await authService.hashPassword(password);
    account.resetPasswordHash = undefined;
    account.resetPasswordExpires = undefined;
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();
    await recordAudit({ auth: { id: account._id, role } }, 'account.password_reset', role, account._id);
    res.json({ ok: true });
}));

module.exports = router;
