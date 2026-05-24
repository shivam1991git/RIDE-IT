const jwt = require("jsonwebtoken");

function auth(requiredRoles = []) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ message: "Authentication required" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
                return res.status(403).json({ message: "You do not have permission for this action" });
            }

            req.auth = decoded;
            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
    };
}

module.exports = auth;
