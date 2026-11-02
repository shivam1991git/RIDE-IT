const { FareConfig } = require('../models/misc');

// Default ride categories (INR). Seeded on first start; admins edit them later.
const DEFAULT_CATEGORIES = [
    { key: 'auto', name: 'Auto', description: 'Quick three-wheeler hops around the city', capacity: 3, baseFare: 30, perKm: 12, perMin: 1, minFare: 40, sortOrder: 1 },
    { key: 'mini', name: 'Mini', description: 'Compact hatchbacks at everyday prices', capacity: 4, baseFare: 50, perKm: 14, perMin: 1.5, minFare: 80, sortOrder: 2 },
    { key: 'sedan', name: 'Sedan', description: 'Roomy sedans with extra boot space', capacity: 4, baseFare: 70, perKm: 17, perMin: 2, minFare: 110, sortOrder: 3 },
    { key: 'suv', name: 'SUV', description: 'Six seats for families and groups', capacity: 6, baseFare: 100, perKm: 22, perMin: 2.5, minFare: 160, sortOrder: 4 },
];

const RENTAL_DRIVER_PER_HOUR = Number(process.env.RENTAL_DRIVER_PER_HOUR) || 30;
const RENTAL_MAX_HOURS = 7 * 24;
const RENTAL_MAX_DAYS_AHEAD = 15;

// Work in paise so that rounding happens exactly once, on the final total.
const toPaise = rupees => Math.round(rupees * 100);
const toRupees = paise => Math.round(paise) / 100;

async function ensureDefaultCategories() {
    await Promise.all(DEFAULT_CATEGORIES.map(category => FareConfig.updateOne(
        { key: category.key },
        { $setOnInsert: category },
        { upsert: true },
    )));
}

async function activeCategories() {
    return FareConfig.find({ active: true }).sort({ sortOrder: 1 }).lean();
}

function computeRideFare(category, distanceKm, durationMin) {
    const base = toPaise(category.baseFare);
    const distance = toPaise(category.perKm * distanceKm);
    const time = toPaise(category.perMin * durationMin);
    const subtotal = base + distance + time;
    const minimum = toPaise(category.minFare);

    const breakdown = [
        { label: 'Base fare', amount: toRupees(base) },
        { label: `Distance (${distanceKm.toFixed(1)} km × ₹${category.perKm})`, amount: toRupees(distance) },
        { label: `Time (${Math.round(durationMin)} min × ₹${category.perMin})`, amount: toRupees(time) },
    ];
    if (subtotal < minimum) {
        breakdown.push({ label: 'Minimum fare adjustment', amount: toRupees(minimum - subtotal) });
    }
    // Fares are charged in whole rupees.
    const total = Math.round(Math.max(subtotal, minimum) / 100);
    return { total, breakdown };
}

function rentalHours(start, end) {
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 3600000));
}

function computeRentalFare(rentPerHour, hours, driverRequired) {
    const rent = toPaise(rentPerHour * hours);
    const driver = driverRequired ? toPaise(RENTAL_DRIVER_PER_HOUR * hours) : 0;
    const breakdown = [{ label: `Rent (${hours} h × ₹${rentPerHour})`, amount: toRupees(rent) }];
    if (driverRequired) {
        breakdown.push({ label: `Driver (${hours} h × ₹${RENTAL_DRIVER_PER_HOUR})`, amount: toRupees(driver) });
    }
    return { total: Math.round((rent + driver) / 100), breakdown };
}

module.exports = {
    DEFAULT_CATEGORIES,
    RENTAL_DRIVER_PER_HOUR,
    RENTAL_MAX_HOURS,
    RENTAL_MAX_DAYS_AHEAD,
    ensureDefaultCategories,
    activeCategories,
    computeRideFare,
    computeRentalFare,
    rentalHours,
};
