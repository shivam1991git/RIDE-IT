const mongoose = require('mongoose');
const { config } = require('./config');

mongoose.set('strictQuery', true);

async function connectDB(uri = config.mongoUri, dbName = config.mongoDbName) {
    // In production indexes are created by `npm run migrate`, which first checks
    // existing data for duplicates, instead of implicitly at boot.
    await mongoose.connect(uri, { dbName, autoIndex: !config.isProduction, serverSelectionTimeoutMS: 10000 });
    return mongoose.connection;
}

module.exports = { connectDB, mongoose };
