const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { connectDB } = require('../src/db');
const { ensureDefaultCategories } = require('../src/services/fare');
const { hashPassword } = require('../src/services/auth');
const { User, Driver, Admin } = require('../src/models/accounts');
const Car = require('../src/models/Car');

let mongo;
let app;

async function setup() {
    mongo = await MongoMemoryServer.create();
    await connectDB(mongo.getUri(), 'ride-it-test');
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await ensureDefaultCategories();
    app = createApp();
    return app;
}

async function teardown() {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
}

async function reset() {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections
        .filter(collection => collection.collectionName !== 'fareconfigs')
        .map(collection => collection.deleteMany({})));
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

const PASSWORD = 'Passw0rd!';

function customerData(overrides = {}) {
    const id = unique();
    return {
        role: 'customer',
        fullName: 'Asha Verma',
        username: `asha_${id}`,
        email: `asha_${id}@example.test`,
        phoneNumber: '9876543210',
        password: PASSWORD,
        ...overrides,
    };
}

async function signIn(role, identifier, password = PASSWORD) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ role, identifier, password });
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
    agent.account = res.body.account;
    agent.accessToken = (res.headers['set-cookie'] || []).join(';').match(/rid_at=([^;]+)/)?.[1];
    return agent;
}

async function customer(overrides) {
    const data = customerData(overrides);
    const res = await request(app).post('/api/auth/register').send(data);
    if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    return signIn('customer', data.username);
}

async function driver({ status = 'approved', category = 'mini', online = true } = {}) {
    const id = unique();
    const doc = await Driver.create({
        fullName: 'Ravi Kumar',
        username: `ravi_${id}`,
        email: `ravi_${id}@example.test`,
        phoneNumber: '9123456780',
        password: await hashPassword(PASSWORD),
        drivingLicenseNumber: 'UP6520190001234',
        dob: '1990-01-01',
        status,
        isOnline: online,
        vehicle: { category, make: 'Maruti', model: 'Swift', plateNumber: 'UP65 AB 1234', color: 'White' },
        lastLocation: { lat: 25.3176, lng: 82.9739, at: new Date() },
    });
    const agent = await signIn('driver', doc.username);
    agent.doc = doc;
    return agent;
}

async function admin() {
    const id = unique();
    const doc = await Admin.create({
        fullName: 'Admin One',
        username: `admin_${id}`,
        email: `admin_${id}@example.test`,
        phoneNumber: '9000000001',
        password: await hashPassword(PASSWORD),
    });
    const agent = await signIn('admin', doc.username);
    agent.doc = doc;
    return agent;
}

async function car(overrides = {}) {
    return Car.create({ name: 'Hyundai Creta', image: '/assets/cars/suv.webp', capacity: 5, fuelType: 'Petrol', rentPerHour: 250, ...overrides });
}

const PLACES = {
    assi: { name: 'Assi Ghat', address: 'Shivala, Varanasi', lat: 25.2860, lng: 83.0066 },
    sarnath: { name: 'Sarnath', address: 'Sarnath, Varanasi', lat: 25.3811, lng: 83.0213 },
    station: { name: 'Varanasi Junction', address: 'Cantonment', lat: 25.3263, lng: 82.9873 },
    delhi: { name: 'Connaught Place', address: 'New Delhi', lat: 28.6315, lng: 77.2167 },
};

module.exports = {
    setup,
    teardown,
    reset,
    request: () => request(app),
    getApp: () => app,
    customer,
    customerData,
    driver,
    admin,
    car,
    signIn,
    PLACES,
    PASSWORD,
    models: { User, Driver, Admin, Car },
};
