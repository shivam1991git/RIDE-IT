const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB, mongoose } = require('./db');

const app = express();
const port = process.env.PORT || 5000;

// ✅ CORS Configuration for Production
const allowedOrigins = [
    'http://localhost:3000',           // Local development
    'http://localhost:5000',           // Local development
    'https://shivam1991git.github.io',
    'https://ride-it-web-app.vercel.app', // Update with your actual Vercel URL
    // Add more production URLs as needed
    process.env.FRONTEND_URL || '',    // From environment variable
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS policy'));
        }
    },
    credentials: true, // Allow cookies and auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

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
            console.log(`🚀 Server running on port ${port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        // ✅ Graceful shutdown for production (Render, Heroku, etc.)
        process.on('SIGTERM', () => {
            console.log('📍 SIGTERM received, closing server gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                mongoose.connection.close(() => {
                    console.log('✅ Database connection closed');
                    process.exit(0);
                });
            });
        });

        // Handle unhandled rejections
        process.on('unhandledRejection', (err) => {
            console.error('❌ Unhandled Rejection:', err);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();
