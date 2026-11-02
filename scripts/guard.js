// Refuses to run destructive dev scripts against anything but a local database.
function assertLocalDatabase(uri) {
    let host;
    try {
        host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).hostname;
    } catch (error) {
        host = '';
    }
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
        console.error(`Refusing to run: MONGO_URI points to "${host || uri}", not a local database.`);
        process.exit(1);
    }
}

module.exports = { assertLocalDatabase };
