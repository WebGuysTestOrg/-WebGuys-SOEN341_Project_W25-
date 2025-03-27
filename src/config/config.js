require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    DB_CONFIG: {
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_DATABASE || "chathaven"
    },
    SESSION_SECRET: process.env.SESSION_SECRET || "your_secret_key",
    SESSION_COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
    INACTIVITY_TIME: 30 * 60 * 1000, // 30 minutes
    CORS_ORIGINS: ["http://localhost:3000", "http://127.0.0.1:3000"],
    SOCKET_CONFIG: {
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 45000,
        cookie: {
            name: "sessionId",
            httpOnly: true,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }
}; 