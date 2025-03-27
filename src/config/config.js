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
    SESSION_COOKIE_MAX_AGE: 3600000, // 1 hour
    INACTIVITY_TIME: 30000, // 30 seconds
    CORS_ORIGINS: process.env.NODE_ENV === "production" 
        ? false 
        : ["http://localhost:3000", "http://127.0.0.1:3000"]
}; 