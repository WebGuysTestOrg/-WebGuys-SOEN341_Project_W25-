const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized - Please login" });
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(403).json({ error: "Forbidden - Admin access required" });
    }
    next();
};

module.exports = { isAuthenticated, isAdmin }; 