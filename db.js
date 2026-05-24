const mongoose = require("mongoose");

async function connectDB() {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is missing in .env file");
        process.exit(1);
    }

    const connection = mongoose.connection;

    connection.on("connected", () => {
        console.log("MongoDB Connected Successfully");
    });

    connection.on("error", (error) => {
        console.error("MongoDB Connection Error:", error.message);
    });

    connection.on("disconnected", () => {
        console.warn("MongoDB Disconnected");
    });

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: process.env.MONGO_DB_NAME || "ride-it",
        });
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error.message);
        process.exit(1);
    }
}

module.exports = { connectDB, mongoose };
