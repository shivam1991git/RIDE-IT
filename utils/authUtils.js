const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function signToken(user, role) {
    return jwt.sign(
        { id: user._id.toString(), role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function toSafeAuthPayload(user, role) {
    const data = user.toObject ? user.toObject() : { ...user };
    delete data.password;

    return {
        ...data,
        role,
        token: signToken(user, role),
    };
}

async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function verifyPasswordAndUpgrade(user, password) {
    if (!user || !password) {
        return false;
    }

    const storedPassword = user.password || "";
    const isHash = storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$");

    if (isHash) {
        return bcrypt.compare(password, storedPassword);
    }

    if (storedPassword === password) {
        user.password = await hashPassword(password);
        await user.save();
        return true;
    }

    return false;
}

module.exports = {
    hashPassword,
    toSafeAuthPayload,
    verifyPasswordAndUpgrade,
};
