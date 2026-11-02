// Public, read-only endpoints: places, ride categories and the rental fleet.
const express = require('express');
const { config } = require('../config');
const Car = require('../models/Car');
const { validate, limiter, idParams } = require('../middleware/common');
const geo = require('../services/geo');
const fare = require('../services/fare');
const { z } = require('../validation');
const { asyncHandler, notFound } = require('../utils/http');

const router = express.Router();
const geoLimiter = limiter({ windowMs: 60 * 1000, limit: 60, message: 'Too many location lookups. Please wait a moment.' });

router.get('/geo/service-area', (req, res) => res.json({ serviceArea: config.serviceArea }));

router.get('/geo/popular', (req, res) => res.json({ places: geo.LANDMARKS }));

router.get('/geo/search', geoLimiter, validate({
    query: z.object({ q: z.string().trim().min(2, 'Type at least 2 characters').max(100) }),
}), asyncHandler(async (req, res) => {
    res.json({ places: await geo.searchPlaces(req.validQuery.q) });
}));

router.get('/geo/reverse', geoLimiter, validate({
    query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }),
}), asyncHandler(async (req, res) => {
    const point = req.validQuery;
    res.json({ place: await geo.reverseGeocode(point), inServiceArea: geo.isInServiceArea(point) });
}));

router.get('/fares/categories', asyncHandler(async (req, res) => {
    const categories = await fare.activeCategories();
    res.json({
        categories: categories.map(({ key, name, description, capacity, baseFare, perKm, perMin, minFare }) => ({ key, name, description, capacity, baseFare, perKm, perMin, minFare })),
        rentalDriverPerHour: fare.RENTAL_DRIVER_PER_HOUR,
    });
}));

router.get('/cars', asyncHandler(async (req, res) => {
    const cars = await Car.find({ active: true }).sort({ rentPerHour: 1 });
    res.json({ cars });
}));

// Busy intervals only — never booking ids or customer details.
router.get('/cars/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
    const car = await Car.findOne({ _id: req.params.id, active: true }).select('+slots');
    if (!car) throw notFound('Car not found');
    const now = new Date();
    const busy = car.slots
        .filter(slot => slot.active && slot.end > now)
        .map(slot => ({ start: slot.start, end: slot.end }))
        .sort((a, b) => a.start - b.start);
    res.json({ car: car.toJSON(), busy });
}));

module.exports = router;
