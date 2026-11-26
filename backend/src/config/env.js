require('dotenv').config({ quiet: true });

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

function list(value) {
    return (value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
    env: env.NODE_ENV || 'development',
    isProduction,
    isTest,
    port: number(env.PORT, 5000),
    trustProxy: number(env.TRUST_PROXY, isProduction ? 1 : 0),

    mongoUri: env.MONGO_URI,
    mongoDbName: env.MONGO_DB_NAME || 'ride-it',

    jwtSecret: env.JWT_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET || (env.JWT_SECRET ? `${env.JWT_SECRET}:refresh` : undefined),
    accessTokenTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshTokenTtl: env.REFRESH_TOKEN_TTL || '7d',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction,

    // Origins allowed to call the API directly (CORS + CSRF origin check).
    frontendUrls: [
        'http://localhost:5173',
        'http://localhost:4173',
        'https://ride-it-aed.vercel.app',
        ...list(env.FRONTEND_URLS || env.FRONTEND_URL),
    ],
    // This project's own Vercel deployment URLs (production + git-branch/preview).
    // Scoped to the owner's team slug, which only that Vercel team can create.
    frontendUrlPattern: /^https:\/\/ride-it-aed(-[a-z0-9-]+)?-thisisshivam1991-6980s-projects\.vercel\.app$/,
    appUrl: env.APP_URL || list(env.FRONTEND_URLS || env.FRONTEND_URL)[0] || (isProduction ? 'https://ride-it-aed.vercel.app' : 'http://localhost:5173'),

    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',

    smtp: {
        host: env.SMTP_HOST || '',
        port: number(env.SMTP_PORT, 587),
        user: env.SMTP_USER || '',
        pass: env.SMTP_PASS || '',
        from: env.MAIL_FROM || 'RIDE-IT <no-reply@ride-it.local>',
    },

    ai: {
        baseUrl: (env.AI_BASE_URL || '').replace(/\/$/, ''),
        apiKey: env.AI_API_KEY || '',
        model: env.AI_MODEL || '',
        timeoutMs: number(env.AI_TIMEOUT_MS, 8000),
    },

    // 'osm' uses public OpenStreetMap services (Photon + OSRM); 'offline' uses
    // the built-in landmark catalogue and straight-line estimates only.
    geoProvider: env.GEO_PROVIDER || (isTest ? 'offline' : 'osm'),
    geoUserAgent: env.GEO_USER_AGENT || 'RIDE-IT/2.0 (personal portfolio project)',
    serviceArea: {
        name: env.SERVICE_AREA_NAME || 'Varanasi',
        lat: number(env.SERVICE_AREA_LAT, 25.3176),
        lng: number(env.SERVICE_AREA_LNG, 82.9739),
        radiusKm: number(env.SERVICE_AREA_RADIUS_KM, 35),
    },

    rateLimitDisabled: env.RATE_LIMIT_DISABLED === 'true',

    // Phase 1 launches chauffeur rentals only. Instant city rides (and their
    // promos, circuits and live share links) stay in the code behind this switch.
    ridesEnabled: env.RIDES_ENABLED === 'true',
};

function assertConfig() {
    const problems = [];
    if (!config.mongoUri) problems.push('MONGO_URI is missing');
    if (!config.jwtSecret) problems.push('JWT_SECRET is missing');
    if (isProduction && config.jwtSecret && config.jwtSecret.length < 32) {
        // Not fatal, so an existing deployment keeps running — but rotate it.
        console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Set a long random value.');
    }
    if (problems.length) {
        throw new Error(`Invalid configuration: ${problems.join('; ')}`);
    }
}

module.exports = { config, assertConfig };
