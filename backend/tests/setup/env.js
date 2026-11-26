const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.MONGO_URI = 'mongodb://placeholder';
process.env.GEO_PROVIDER = 'offline';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.STRIPE_SECRET_KEY = '';
process.env.AI_BASE_URL = '';
// Instant rides are off in production for Phase 1, but their tests still run.
process.env.RIDES_ENABLED = 'true';

// Use the locally installed mongod binary (an isolated throwaway instance on a
// random port and temp directory) instead of downloading one.
const systemMongod = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(systemMongod)) {
    process.env.MONGOMS_SYSTEM_BINARY = systemMongod;
    process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '8.2.3';
}
