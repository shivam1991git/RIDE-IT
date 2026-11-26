// Migrates a v1 RIDE-IT database to the v2 schema.
//   npm run migrate            -> DRY RUN: reports what would change, writes nothing
//   npm run migrate -- --apply -> applies the changes
// Take a backup (Atlas snapshot or mongodump) before running with --apply.
// Every step is additive and idempotent: v1 fields are left in place.
const mongoose = require('mongoose');
const { assertConfig } = require('../src/config/env');
const { connectDB } = require('../src/config/database');
const { ensureDefaultCategories } = require('../src/modules/rides/fare.service');
// Register every model so syncIndexes() below covers all collections.
require('../src/modules/accounts/account.model');
require('../src/modules/fleet/car.model');
require('../src/modules/bookings/booking.model');
require('../src/modules/rides/fare-config.model');
require('../src/modules/notifications/notification.model');
require('../src/modules/support/support-ticket.model');
require('../src/modules/audit/audit-log.model');
require('../src/modules/support/feedback.model');
require('../src/modules/rides/promo.model');
require('../src/modules/rentals/rental-rate.model');
require('../src/modules/fleet/fleet-owner.model');
require('../src/modules/payments/payment.model');
require('../src/modules/settings/settings.model');
require('../src/modules/bookings/booking-counter.model');

const APPLY = process.argv.includes('--apply');

const STATUS_MAP = {
    Confirmed: 'confirmed',
    Pending: 'pending_driver',
    'Driver Confirmation Pending': 'pending_driver',
    Cancelled: 'cancelled',
};

// v1 stored either ISO strings (moment#toJSON) or "MM DD YYYY HH:mm" in IST.
function parseLegacyDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(value)) return iso;
    const match = String(value).match(/^(\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2})$/);
    if (match) {
        const [, mm, dd, yyyy, hh, min] = match;
        return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`);
    }
    return Number.isNaN(iso.getTime()) ? null : iso;
}

async function findDuplicates(collection, field) {
    return collection.aggregate([
        { $group: { _id: { $toLower: `$${field}` }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
    ]).toArray();
}

async function main() {
    assertConfig();
    await connectDB();
    const db = mongoose.connection.db;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} migration on database "${db.databaseName}"\n`);
    const report = [];

    // 1. Duplicate accounts would block the new unique indexes.
    let duplicates = 0;
    for (const name of ['users', 'drivers', 'admins']) {
        for (const field of ['username', 'email']) {
            const dupes = await findDuplicates(db.collection(name), field);
            dupes.forEach(dupe => console.warn(`  duplicate ${name}.${field} "${dupe._id}": ${dupe.ids.join(', ')}`));
            duplicates += dupes.length;
        }
    }
    report.push(`duplicate account keys: ${duplicates}`);

    // 2. Drivers that existed in v1 were already active, so they start approved.
    const drivers = db.collection('drivers');
    const legacyDrivers = await drivers.countDocuments({ status: { $exists: false } });
    report.push(`drivers to mark approved: ${legacyDrivers}`);
    if (APPLY && legacyDrivers) await drivers.updateMany({ status: { $exists: false } }, { $set: { status: 'approved', isOnline: false } });

    // 3. v1 bookings were all hourly rentals.
    const bookings = db.collection('bookings');
    const legacyBookings = await bookings.find({ type: { $exists: false } }).toArray();
    let unparsable = 0;
    const now = new Date();
    for (const booking of legacyBookings) {
        const start = parseLegacyDate(booking.bookedTimeSlot?.from);
        const end = parseLegacyDate(booking.bookedTimeSlot?.to);
        if (!start || !end) unparsable += 1;
        let status = STATUS_MAP[booking.status] || 'confirmed';
        if (status === 'confirmed' && end && end < now) status = 'completed';
        if (APPLY) {
            await bookings.updateOne({ _id: booking._id }, {
                $set: {
                    type: 'rental',
                    status,
                    legacyStatus: booking.status,
                    start: start || booking.createdAt,
                    end: end || booking.createdAt,
                    currency: 'INR',
                    payment: { method: 'cash', status: status === 'completed' ? 'paid' : 'pending' },
                    timeline: [{ status, at: booking.createdAt || now, by: 'migration' }],
                },
            });
        }
    }
    report.push(`legacy bookings to convert: ${legacyBookings.length} (unparsable dates: ${unparsable})`);

    // 4. Rebuild each car's reservation slots from its bookings.
    const cars = db.collection('cars');
    const legacyCars = await cars.find({ slots: { $exists: false } }).toArray();
    for (const car of legacyCars) {
        const carBookings = await bookings.find({ car: car._id }).toArray();
        const slots = carBookings
            .map(b => ({ start: b.start || parseLegacyDate(b.bookedTimeSlot?.from), end: b.end || parseLegacyDate(b.bookedTimeSlot?.to), booking: b._id, active: !['Cancelled', 'cancelled'].includes(b.status) }))
            .filter(slot => slot.start && slot.end);
        if (APPLY) await cars.updateOne({ _id: car._id }, { $set: { slots, active: car.active !== false } });
    }
    report.push(`cars to rebuild slots for: ${legacyCars.length}`);

    // 5. Normalise phone numbers and pincodes stored as numbers.
    for (const name of ['users', 'drivers', 'admins']) {
        const numeric = await db.collection(name).countDocuments({ $or: [{ phoneNumber: { $type: 'number' } }, { pincode: { $type: 'number' } }] });
        report.push(`${name} with numeric phone/pincode: ${numeric}`);
        if (APPLY && numeric) {
            await db.collection(name).updateMany({ phoneNumber: { $type: 'number' } }, [{ $set: { phoneNumber: { $toString: { $toLong: '$phoneNumber' } } } }]);
            await db.collection(name).updateMany({ pincode: { $type: 'number' } }, [{ $set: { pincode: { $toString: { $toLong: '$pincode' } } } }]);
        }
    }

    // 6. Plaintext passwords (upgraded automatically on next login, reported here).
    for (const name of ['users', 'drivers', 'admins']) {
        const plaintext = await db.collection(name).countDocuments({ password: { $not: /^\$2[aby]\$/ } });
        report.push(`${name} with plaintext passwords (upgrade on next login): ${plaintext}`);
    }

    if (APPLY) {
        await ensureDefaultCategories();
        if (duplicates) {
            report.push('indexes: SKIPPED — resolve the duplicate accounts above, then run again');
        } else {
            for (const model of Object.values(mongoose.models)) await model.syncIndexes();
            report.push('indexes: synced');
        }
    }

    console.log(report.map(line => `  - ${line}`).join('\n'));
    if (!APPLY) console.log('\nNothing was written. Re-run with --apply after taking a backup.');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
