const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const mongoose = require('mongoose');
const { config } = require('../config');
const { HttpError } = require('../utils/http');

// Parses and replaces req.body / req.query / req.params. Unknown keys are
// stripped, which blocks mass assignment and Mongo operator injection.
function validate(schemas) {
    return (req, res, next) => {
        try {
            for (const part of ['params', 'query', 'body']) {
                if (!schemas[part]) continue;
                const parsed = schemas[part].parse(req[part] ?? {});
                if (part === 'query') {
                    // req.query is a getter in Express; store the parsed copy separately.
                    req.validQuery = parsed;
                } else {
                    req[part] = parsed;
                }
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

const objectId = z.string().refine(value => mongoose.isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value), 'Invalid id');
const idParams = z.object({ id: objectId });

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    if (err instanceof z.ZodError) {
        const details = err.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
        return res.status(400).json({ error: { code: 'validation_failed', message: details[0]?.message || 'Invalid request', details } });
    }
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON' } });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: { code: 'too_large', message: 'Request body is too large' } });
    }
    if (err instanceof mongoose.Error.CastError) {
        return res.status(400).json({ error: { code: 'bad_request', message: `Invalid ${err.path}` } });
    }
    if (err instanceof mongoose.Error.ValidationError) {
        const first = Object.values(err.errors)[0];
        return res.status(400).json({ error: { code: 'validation_failed', message: first?.message || 'Invalid data' } });
    }
    if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || 'value';
        return res.status(409).json({ error: { code: 'duplicate', message: `That ${field} is already in use` } });
    }

    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
}

function notFoundHandler(req, res) {
    res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
}

// CSRF defence in depth: cookies are SameSite=Lax, and state-changing requests
// that carry a browser Origin must come from an allowed origin.
function originGuard(isAllowedOrigin) {
    return (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        const origin = req.headers.origin;
        if (!origin || isAllowedOrigin(origin) || origin === `${req.protocol}://${req.get('host')}`) return next();
        return res.status(403).json({ error: { code: 'bad_origin', message: 'Request origin is not allowed' } });
    };
}

function limiter({ windowMs, limit, keyGenerator, message }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: () => config.rateLimitDisabled,
        keyGenerator,
        handler: (req, res) => res.status(429).json({ error: { code: 'rate_limited', message: message || 'Too many requests. Please slow down.' } }),
    });
}

module.exports = { validate, objectId, idParams, errorHandler, notFoundHandler, originGuard, limiter };
