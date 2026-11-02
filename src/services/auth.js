const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config');

const ACCESS_COOKIE = 'rid_at';
const REFRESH_COOKIE = 'rid_rt';
const REFRESH_PATH = '/api/auth';

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

const hashPassword = password => bcrypt.hash(password, BCRYPT_ROUNDS);

// v1 accounts may still hold plaintext passwords; upgrade them on first login.
async function verifyPassword(account, password) {
    if (!account || typeof password !== 'string') {
        // Spend comparable time so missing accounts are not distinguishable.
        await bcrypt.compare('timing-equaliser', DUMMY_HASH);
        return false;
    }
    const stored = account.password || '';
    if (/^\$2[aby]\$/.test(stored)) {
        return bcrypt.compare(password, stored);
    }
    const a = Buffer.from(stored);
    const b = Buffer.from(password);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        account.password = await hashPassword(password);
        await account.save();
        return true;
    }
    return false;
}

function signAccessToken(account, role) {
    return jwt.sign({ sub: account._id.toString(), role, tv: account.tokenVersion || 0 }, config.jwtSecret, { expiresIn: config.accessTokenTtl });
}

function signRefreshToken(account, role) {
    return jwt.sign({ sub: account._id.toString(), role, tv: account.tokenVersion || 0, typ: 'refresh' }, config.jwtRefreshSecret, { expiresIn: config.refreshTokenTtl });
}

function signSocketToken(auth) {
    return jwt.sign({ sub: auth.id, role: auth.role, tv: auth.tv, typ: 'socket' }, config.jwtSecret, { expiresIn: '10m' });
}

function cookieOptions(maxAgeMs, path = '/') {
    return {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path,
        maxAge: maxAgeMs,
    };
}

function issueSession(res, account, role) {
    res.cookie(ACCESS_COOKIE, signAccessToken(account, role), cookieOptions(15 * 60 * 1000));
    res.cookie(REFRESH_COOKIE, signRefreshToken(account, role), cookieOptions(7 * 24 * 60 * 60 * 1000, REFRESH_PATH));
}

function clearSession(res) {
    res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(0), maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(0, REFRESH_PATH), maxAge: undefined });
}

function createResetToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, hash: hashResetToken(token), expires: new Date(Date.now() + 30 * 60 * 1000) };
}

function hashResetToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    hashPassword,
    verifyPassword,
    signAccessToken,
    signSocketToken,
    issueSession,
    clearSession,
    createResetToken,
    hashResetToken,
};
