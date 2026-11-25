const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { config } = require('./config');
const { errorHandler, notFoundHandler, originGuard, limiter } = require('./middleware/common');
const { webhookHandler, router: paymentsRouter } = require('./routes/payments');

function isAllowedOrigin(origin) {
    return config.frontendUrls.includes(origin) || config.frontendUrlPattern.test(origin);
}

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    if (config.trustProxy) app.set('trust proxy', config.trustProxy);

    app.use(helmet({
        // API only serves JSON; the SPA sets its own CSP on Vercel.
        contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
        crossOriginResourcePolicy: { policy: 'same-site' },
    }));
    app.use(cors({
        origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 600,
    }));

    // Stripe needs the raw body to verify webhook signatures.
    app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), webhookHandler);

    app.use(express.json({ limit: '50kb' }));
    app.use(cookieParser());
    app.use('/api', originGuard(isAllowedOrigin));
    app.use('/api', limiter({ windowMs: 60 * 1000, limit: 300 }));

    app.get('/api/health', (req, res) => {
        const dbUp = mongoose.connection.readyState === 1;
        res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: dbUp ? 'up' : 'down' });
    });

    app.use('/api', (req, res, next) => {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: { code: 'db_unavailable', message: 'Service is temporarily unavailable. Please try again shortly.' } });
        }
        return next();
    });

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api', require('./routes/catalog'));
    app.use('/api', require('./routes/rentals').router);
    app.use('/api', require('./routes/booking').router);
    app.use('/api/driver', require('./routes/driver'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api', require('./routes/account').router);
    app.use('/api', paymentsRouter);
    app.use('/api', require('./routes/chat'));

    app.get('/', (req, res) => res.json({ name: 'RIDE-IT API', health: '/api/health' }));
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

module.exports = { createApp, isAllowedOrigin };
