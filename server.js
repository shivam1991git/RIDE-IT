const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB, mongoose } = require('./db');

const app = express();
const port = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing. Login cannot work without a token signing secret.");
    process.exit(1);
}

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'https://shivam1991git.github.io',
    'https://ride-it-web-app.vercel.app',
    ...(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
];

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.includes(origin)) {
        return true;
    }

    try {
        const { hostname } = new URL(origin);
        return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
    } catch (error) {
        return false;
    }
}

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            message: 'Database connection is not available. Check MONGO_URI, MONGO_DB_NAME, and MongoDB Atlas access.',
        });
    }
    next();
});

app.use('/api/cars/', require('./routes/carsRoute'));
app.use('/api/users/', require('./routes/usersRoute'));
app.use('/api/drivers/', require('./routes/driversRoute'));
app.use('/api/admins/', require('./routes/adminsRoute'));
app.use('/api/bookings/', require('./routes/bookingsRoute'));
app.use('/api/feedbacks/', require('./routes/feedbackRoute'));

app.get('/', (req, res) => res.send('Hello World!'));

async function startServer() {
    try {
        await connectDB();

        const server = app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        process.on('SIGTERM', () => {
            console.log('SIGTERM received, closing server gracefully...');
            server.close(() => {
                mongoose.connection.close(() => {
                    console.log('Server and database connection closed');
                    process.exit(0);
                });
            });
        });

        process.on('unhandledRejection', (err) => {
            console.error('Unhandled Rejection:', err);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();
