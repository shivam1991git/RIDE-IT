const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { accountModel } = require('../models/accounts');
const { ACCESS_COOKIE } = require('../services/auth');
const { unauthorized, forbidden } = require('../utils/http');

function readToken(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7);
    return req.cookies?.[ACCESS_COOKIE] || null;
}

// Resolves the caller from the access token and re-checks the account on every
// request, so suspensions, deletions and "log out everywhere" apply at once.
async function resolveAuth(req) {
    const token = readToken(req);
    if (!token) return null;

    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret);
    } catch (error) {
        throw unauthorized(error.name === 'TokenExpiredError' ? 'Your session has expired' : 'Invalid session');
    }
    if (payload.typ) throw unauthorized('Invalid session');

    const account = await accountModel(payload.role).findById(payload.sub).select('tokenVersion status adminRole').lean();
    if (!account || (account.tokenVersion || 0) !== payload.tv) throw unauthorized('Your session is no longer valid');
    if (account.status === 'suspended') throw forbidden('Your account is suspended. Contact support.');

    const auth = { id: payload.sub, role: payload.role, tv: payload.tv, status: account.status };
    // Read fresh on every request, so a role change applies immediately.
    if (payload.role === 'admin') auth.adminRole = account.adminRole || 'super';
    return auth;
}

// Limits an admin route to some admin roles (super, operations, support).
function allowAdmin(...adminRoles) {
    return (req, res, next) => {
        if (req.auth?.role === 'admin' && adminRoles.includes(req.auth.adminRole)) return next();
        return next(forbidden('Your admin role does not allow this action'));
    };
}

function requireAuth(...roles) {
    return async (req, res, next) => {
        try {
            const auth = await resolveAuth(req);
            if (!auth) throw unauthorized();
            if (roles.length && !roles.includes(auth.role)) throw forbidden();
            req.auth = auth;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function optionalAuth(req, res, next) {
    try {
        req.auth = await resolveAuth(req);
    } catch (error) {
        req.auth = null;
    }
    next();
}

module.exports = { requireAuth, optionalAuth, resolveAuth, allowAdmin };
