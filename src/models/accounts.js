const mongoose = require('mongoose');

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const ratingSchema = new mongoose.Schema({
    total: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
}, { _id: false });

// Fields shared by every account collection. The three collections (user,
// driver, admin) are kept from v1 so existing production records stay valid.
function baseFields() {
    return {
        fullName: { type: String, required: true, trim: true, maxlength: 80 },
        username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
        email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
        // v1 stored phone and pincode as Number; strings keep leading zeros and +91.
        phoneNumber: { type: String, required: true, trim: true },
        address: { type: String, trim: true, maxlength: 200 },
        state: { type: String, trim: true, maxlength: 60 },
        pincode: { type: String, trim: true, maxlength: 10 },
        gender: { type: String, trim: true, maxlength: 20 },
        password: { type: String, required: true, select: false },
        tokenVersion: { type: Number, default: 0 },
        resetPasswordHash: { type: String, select: false },
        resetPasswordExpires: { type: Date, select: false },
    };
}

function hideSecrets(doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    delete ret.resetPasswordHash;
    delete ret.resetPasswordExpires;
    delete ret.__v;
    return ret;
}

function publicRating(rating) {
    const count = rating?.count || 0;
    return { average: count ? Math.round((rating.total / count) * 10) / 10 : null, count };
}

function withRatingAverage(doc, ret) {
    hideSecrets(doc, ret);
    if (ret.rating) ret.rating = publicRating(ret.rating);
    return ret;
}

function buildSchema(extra) {
    const schema = new mongoose.Schema({ ...baseFields(), ...extra }, {
        timestamps: true,
        toJSON: { transform: withRatingAverage },
        toObject: { transform: withRatingAverage },
    });
    schema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });
    schema.index({ email: 1 }, { unique: true, collation: CASE_INSENSITIVE });
    return schema;
}

const placeSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true, maxlength: 30 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
});

const userSchema = buildSchema({
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    savedPlaces: { type: [placeSchema], default: [] },
    // Someone the rider trusts; offered as a one-tap share target during SOS.
    trustedContact: {
        name: { type: String, trim: true, maxlength: 60 },
        phone: { type: String, trim: true, maxlength: 15 },
    },
    rating: { type: ratingSchema, default: () => ({}) },
});

const VEHICLE_CATEGORIES = ['auto', 'mini', 'sedan', 'suv'];

const driverSchema = buildSchema({
    drivingLicenseNumber: { type: String, required: true, trim: true, maxlength: 30 },
    dob: { type: String, trim: true },
    // New drivers must be verified by an admin before they can take rides.
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    isOnline: { type: Boolean, default: false },
    vehicle: {
        category: { type: String, enum: VEHICLE_CATEGORIES },
        make: { type: String, trim: true, maxlength: 40 },
        model: { type: String, trim: true, maxlength: 40 },
        plateNumber: { type: String, trim: true, uppercase: true, maxlength: 15 },
        color: { type: String, trim: true, maxlength: 20 },
    },
    lastLocation: {
        lat: Number,
        lng: Number,
        at: Date,
    },
    rating: { type: ratingSchema, default: () => ({}) },
});
driverSchema.index({ status: 1, isOnline: 1, 'vehicle.category': 1 });

const adminSchema = buildSchema({
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
});

const User = mongoose.model('user', userSchema);
const Driver = mongoose.model('driver', driverSchema);
const Admin = mongoose.model('admin', adminSchema);

const ROLES = ['customer', 'driver', 'admin'];
const MODELS = { customer: User, driver: Driver, admin: Admin };

function accountModel(role) {
    const model = MODELS[role];
    if (!model) throw new Error(`Unknown role: ${role}`);
    return model;
}

module.exports = {
    User,
    Driver,
    Admin,
    ROLES,
    VEHICLE_CATEGORIES,
    CASE_INSENSITIVE,
    accountModel,
    publicRating,
};
