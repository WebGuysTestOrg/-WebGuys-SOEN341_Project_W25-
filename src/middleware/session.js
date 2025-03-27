const session = require("express-session");
const config = require("../config/config");

const sessionMiddleware = session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: config.SESSION_COOKIE_MAX_AGE },
});

module.exports = sessionMiddleware; 