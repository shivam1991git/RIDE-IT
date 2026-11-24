const http = require('http');
const { config, assertConfig } = require('./src/config');
const { connectDB, mongoose } = require('./src/db');
const { createApp, isAllowedOrigin } = require('./src/app');
const { attachRealtime } = require('./src/services/realtime');
const { ensureDefaultCategories } = require('./src/services/fare');
const { expireStaleRideRequests, dispatchScheduledRides } = require('./src/services/bookings');

async function start() {
    assertConfig();
    await connectDB();
    await ensureDefaultCategories();

    const app = createApp();
    const server = http.createServer(app);
    attachRealtime(server, isAllowedOrigin);

    const sweeper = setInterval(() => {
        expireStaleRideRequests().catch(error => console.error('Ride expiry sweep failed:', error.message));
        dispatchScheduledRides().catch(error => console.error('Scheduled ride dispatch failed:', error.message));
    }, 60 * 1000);

    server.listen(config.port, () => {
        console.log(`RIDE-IT API listening on port ${config.port} (${config.env})`);
    });

    const shutdown = signal => {
        console.log(`${signal} received, shutting down...`);
        clearInterval(sweeper);
        server.close(() => mongoose.connection.close().then(() => process.exit(0)));
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
}

start().catch(error => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
});
