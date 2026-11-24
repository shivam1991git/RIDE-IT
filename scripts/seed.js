// Fills a LOCAL database with synthetic demo data. Never point this at production.
// Usage: npm run seed            (adds data if the database is empty)
//        npm run seed -- --reset (wipes the local database first)
const mongoose = require('mongoose');
const { config } = require('../src/config');
const { connectDB } = require('../src/db');
const { assertLocalDatabase } = require('./guard');
const { User, Driver, Admin } = require('../src/models/accounts');
const Car = require('../src/models/Car');
const { Booking } = require('../src/models/Booking');
const { Feedback } = require('../src/models/misc');
const { Promo } = require('../src/models/Promo');
const { hashPassword } = require('../src/services/auth');
const fare = require('../src/services/fare');
const geo = require('../src/services/geo');

const DEMO_PASSWORD = 'Demo@1234';
const place = name => {
    const p = geo.LANDMARKS.find(landmark => landmark.name.startsWith(name));
    return { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
};

async function main() {
    assertLocalDatabase(config.mongoUri || '');
    await connectDB();
    if (process.argv.includes('--reset')) {
        await mongoose.connection.dropDatabase();
        console.log('Local database reset.');
    }
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await fare.ensureDefaultCategories();

    if (await User.estimatedDocumentCount()) {
        console.log('Database already has data. Use --reset to start over.');
        return;
    }
    const password = await hashPassword(DEMO_PASSWORD);

    await Admin.create({ fullName: 'Demo Admin', username: 'admin', email: 'admin@ride-it.test', phoneNumber: '9000000001', password });

    const customers = await User.create([
        { fullName: 'Asha Verma', username: 'asha', email: 'asha@ride-it.test', phoneNumber: '9876500001', password, savedPlaces: [{ label: 'Home', ...place('Lanka') }, { label: 'Work', ...place('Sigra') }] },
        { fullName: 'Rohan Mehta', username: 'rohan', email: 'rohan@ride-it.test', phoneNumber: '9876500002', password },
        { fullName: 'Priya Singh', username: 'priya', email: 'priya@ride-it.test', phoneNumber: '9876500003', password },
    ]);

    const driverBase = { password, dob: '1988-04-12', drivingLicenseNumber: 'UP6520150000000', isOnline: false };
    const drivers = await Driver.create([
        { ...driverBase, fullName: 'Ravi Kumar', username: 'ravi', email: 'ravi@ride-it.test', phoneNumber: '9123400001', status: 'approved', isOnline: true, vehicle: { category: 'mini', make: 'Maruti', model: 'Swift', plateNumber: 'UP65 AB 1234', color: 'White' }, lastLocation: { ...place('Godowlia'), at: new Date() } },
        { ...driverBase, fullName: 'Sunil Yadav', username: 'sunil', email: 'sunil@ride-it.test', phoneNumber: '9123400002', status: 'approved', vehicle: { category: 'sedan', make: 'Honda', model: 'City', plateNumber: 'UP65 CD 5678', color: 'Silver' } },
        { ...driverBase, fullName: 'Imran Khan', username: 'imran', email: 'imran@ride-it.test', phoneNumber: '9123400003', status: 'approved', vehicle: { category: 'auto', make: 'Bajaj', model: 'RE', plateNumber: 'UP65 T 4321', color: 'Green' } },
        { ...driverBase, fullName: 'Manoj Tiwari', username: 'manoj', email: 'manoj@ride-it.test', phoneNumber: '9123400004', status: 'approved', vehicle: { category: 'suv', make: 'Mahindra', model: 'XUV700', plateNumber: 'UP65 EF 9012', color: 'Black' } },
        { ...driverBase, fullName: 'Deepak Gupta', username: 'deepak', email: 'deepak@ride-it.test', phoneNumber: '9123400005', status: 'pending', vehicle: { category: 'mini', make: 'Hyundai', model: 'i20', plateNumber: 'UP65 GH 3456', color: 'Blue' } },
    ]);

    await Car.create([
        { name: 'Maruti Swift', image: '/cars/hatch.svg', capacity: 4, fuelType: 'Petrol', transmission: 'Manual', rentPerHour: 150 },
        { name: 'Honda City', image: '/cars/sedan.svg', capacity: 5, fuelType: 'Petrol', transmission: 'Automatic', rentPerHour: 220 },
        { name: 'Tata Nexon EV', image: '/cars/compact-suv.svg', capacity: 5, fuelType: 'Electric', transmission: 'Automatic', rentPerHour: 260 },
        { name: 'Mahindra XUV700', image: '/cars/suv.svg', capacity: 7, fuelType: 'Diesel', transmission: 'Automatic', rentPerHour: 350 },
        { name: 'Toyota Innova Crysta', image: '/cars/mpv.svg', capacity: 7, fuelType: 'Diesel', transmission: 'Manual', rentPerHour: 380 },
    ]);

    // Completed ride history so dashboards have something to show.
    const categories = Object.fromEntries((await fare.activeCategories()).map(category => [category.key, category]));
    const trips = [
        ['Assi', 'Sarnath', 0, 0, 1], ['Varanasi Junction', 'Kashi', 0, 0, 2], ['Banaras', 'Dashashwamedh', 1, 0, 3],
        ['Lal Bahadur', 'Godowlia', 1, 1, 4], ['Sigra', 'Ramnagar', 2, 3, 5], ['Lanka', 'Varanasi Junction', 2, 2, 6],
        ['Godowlia', 'Assi', 0, 0, 0], ['Sarnath', 'Sigra', 1, 1, 0],
    ];
    for (const [from, to, customerIndex, driverIndex, daysAgo] of trips) {
        const pickup = place(from);
        const drop = place(to);
        const driver = drivers[driverIndex];
        const route = await geo.getRoute(pickup, drop);
        const price = fare.computeRideFare(categories[driver.vehicle.category], route.distanceKm, route.durationMin);
        const when = new Date(Date.now() - daysAgo * 24 * 3600 * 1000 - 2 * 3600 * 1000);
        const score = 4 + (daysAgo % 2);
        const booking = await Booking.create({
            type: 'ride', user: customers[customerIndex]._id, driver: driver._id, status: 'completed', category: driver.vehicle.category,
            pickup, drop, distanceKm: route.distanceKm, durationMin: route.durationMin, routeSource: route.source, routeGeometry: route.geometry,
            pin: '0000', totalAmount: price.total, fareBreakdown: price.breakdown,
            payment: { method: 'cash', status: 'paid', paidAt: when },
            timeline: ['requested', 'accepted', 'arrived', 'in_progress', 'completed'].map((status, i) => ({ status, at: new Date(when.getTime() + i * 5 * 60000), by: i ? 'driver' : 'customer' })),
            ratingByCustomer: { score, comment: score === 5 ? 'Very polite driver, clean car.' : 'On time and smooth.', at: when },
        });
        await Booking.collection.updateOne({ _id: booking._id }, { $set: { createdAt: when, updatedAt: new Date(when.getTime() + 25 * 60000) } });
        await Driver.updateOne({ _id: driver._id }, { $inc: { 'rating.total': score, 'rating.count': 1 } });
    }

    await Feedback.create([
        { appRating: 5, additionalComments: 'Booking from the ghats was super easy.', userId: customers[0]._id },
        { appRating: 4, additionalComments: 'Would love UPI support.', userId: customers[1]._id },
    ]);

    const monthAhead = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await Promo.create([
        { code: 'WELCOME50', description: 'Half off your ride, up to ₹100', kind: 'percent', value: 50, maxDiscount: 100, validUntil: monthAhead },
        { code: 'DARSHAN100', description: '₹100 off Darshan Circuits and longer trips', kind: 'flat', value: 100, minFare: 400, perUserLimit: 3, validUntil: monthAhead },
        { code: 'AUTO20', description: '₹20 off any auto ride', kind: 'flat', value: 20, categories: ['auto'], perUserLimit: 5, validUntil: monthAhead },
        { code: 'STAFFONLY', description: 'Internal test code (hidden from Offers)', kind: 'percent', value: 10, public: false, validUntil: monthAhead },
    ]);
    await User.updateOne({ username: 'asha' }, { $set: { trustedContact: { name: 'Meera (sister)', phone: '9811122233' } } });

    console.log(`Seeded synthetic demo data. Password for every demo account: ${DEMO_PASSWORD}
  admin    -> admin
  riders   -> asha (has a trusted contact), rohan, priya
  drivers  -> ravi (mini, online), sunil (sedan), imran (auto), manoj (suv), deepak (pending approval)
  promos   -> WELCOME50, DARSHAN100, AUTO20 (public), STAFFONLY (hidden)`);
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
