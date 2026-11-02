// Creates an admin account from the command line (there is no public admin sign-up).
// Usage: npm run create-admin -- --username alice --email alice@example.com --name "Alice" --phone 9876543210
// The password is read from the ADMIN_PASSWORD environment variable.
const mongoose = require('mongoose');
const { assertConfig } = require('../src/config');
const { connectDB } = require('../src/db');
const { Admin, CASE_INSENSITIVE } = require('../src/models/accounts');
const { hashPassword } = require('../src/services/auth');
const v = require('../src/validation');

function arg(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
    assertConfig();
    const data = v.customerRegistration.parse({
        fullName: arg('name'),
        username: arg('username'),
        email: arg('email'),
        phoneNumber: arg('phone'),
        password: process.env.ADMIN_PASSWORD,
    });
    await connectDB();
    const exists = await Admin.exists({ $or: [{ username: data.username }, { email: data.email }] }).collation(CASE_INSENSITIVE);
    if (exists) throw new Error('An admin with that username or email already exists');
    await Admin.create({ ...data, password: await hashPassword(data.password) });
    console.log(`Admin "${data.username}" created.`);
}

main()
    .catch(error => {
        console.error(error.issues ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n') : error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
