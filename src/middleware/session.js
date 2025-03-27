const session = require("express-session");
const config = require("../config/config");

const sessionMiddleware = session({
    secret: config.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { 
        maxAge: config.SESSION_COOKIE_MAX_AGE,
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        path: '/'
    },
    name: 'sessionId',
    store: new session.MemoryStore(),
    rolling: true
});

module.exports = sessionMiddleware; 