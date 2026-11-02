const { z } = require('zod');
const { VEHICLE_CATEGORIES } = require('./models/accounts');

const required = label => ({ error: issue => (issue.input === undefined ? `${label} is required` : `${label} must be text`) });

const trimmed = (min, max, label) => z.string(required(label))
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const password = z.string(required('Password'))
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), 'Password must contain a letter and a number');

const username = trimmed(3, 30, 'Username').regex(/^[a-zA-Z0-9_.]+$/, 'Username can only use letters, numbers, dots and underscores');
const email = z.string(required('Email')).trim().toLowerCase().email('Enter a valid email address').max(120);
const phone = z.string(required('Phone number')).trim()
    .transform(value => value.replace(/[\s-]/g, ''))
    .refine(value => /^(\+91)?[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit Indian mobile number');

const optionalText = max => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const profileFields = {
    fullName: trimmed(2, 80, 'Full name'),
    phoneNumber: phone,
    address: optionalText(200),
    state: optionalText(60),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('').transform(() => undefined)),
    gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
};

const vehicle = z.object({
    category: z.enum(VEHICLE_CATEGORIES, { error: 'Choose a vehicle category' }),
    make: trimmed(2, 40, 'Vehicle make'),
    model: trimmed(1, 40, 'Vehicle model'),
    plateNumber: trimmed(4, 15, 'Plate number').transform(value => value.toUpperCase().replace(/\s+/g, ' ')),
    color: optionalText(20),
});

const customerRegistration = z.object({
    ...profileFields,
    username,
    email,
    password,
});

const driverRegistration = customerRegistration.extend({
    drivingLicenseNumber: trimmed(6, 30, 'Driving licence number').transform(value => value.toUpperCase()),
    dob: z.string().refine(value => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return false;
        const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
        return age >= 18 && age <= 75;
    }, 'Drivers must be between 18 and 75 years old'),
    vehicle,
});

const place = z.object({
    name: trimmed(1, 120, 'Place name'),
    address: z.string().trim().max(250).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

const isoDate = label => z.iso.datetime({ offset: true, error: `${label} must be a valid date and time` })
    .transform(value => new Date(value));

module.exports = {
    z,
    password,
    username,
    email,
    phone,
    profileFields,
    vehicle,
    customerRegistration,
    driverRegistration,
    place,
    isoDate,
    trimmed,
};
