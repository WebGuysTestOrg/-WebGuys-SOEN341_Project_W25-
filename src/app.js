const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");

// --- Import Routers ---
const chatRoutes = require('./routes/chatRoutes');
const channelRoutes = require('./routes/channelRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const teamRoutes = require('./routes/teamRoutes');
const groupMessagesRoute = require('./routes/groupMessages');
const groupRoutes = require('./routes/groupRoutes');

const app = express();

// Configure global middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Define session middleware (needed by server.js for Socket.IO)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "your_secret_key", // Use environment variable
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: process.env.SESSION_MAX_AGE || 3600000, // Use environment variable (1 hour)
        // Consider adding secure: true in production if using HTTPS
        // secure: process.env.NODE_ENV === 'production',
        // httpOnly: true // Good practice for security
     }, 
});

app.use(sessionMiddleware);

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, "public")));

// Set view engine (assuming EJS, adjust if different)
// Example: app.set('view engine', 'ejs');
// Example: app.set('views', path.join(__dirname, 'views'));

// --- Mount Routers ---
app.use('/', chatRoutes);
app.use('/channels', channelRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', groupMessagesRoute);
app.use('/api/groups', groupRoutes);

// Export the configured app and session middleware
module.exports = { app, sessionMiddleware }; 