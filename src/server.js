const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const config = require("./config/config");
const sessionMiddleware = require("./middleware/session");
const { protectAdminRoute } = require("./middleware/routeProtection");
const { initializeSocket } = require("./socket/socket");
const connection = require("./database/connection");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const teamsRoutes = require("./routes/teams");
const groupsRoutes = require("./routes/groups");

const app = express();
let expressServer;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(sessionMiddleware);

// Protected admin routes - must come before static file serving
app.get("/admin_page.html", protectAdminRoute, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin_page.html"));
});

// Serve static files after protected routes
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", teamsRoutes);
app.use("/", groupsRoutes);

// Initialize server and socket
if (process.env.NODE_ENV !== "test") {
    expressServer = app.listen(config.PORT, () => {
        console.log(`Server running at http://localhost:${config.PORT}`);
        
        // Initialize Socket.IO after server is listening
        const io = initializeSocket(expressServer, sessionMiddleware);
        
        // Store io instance in app for route access
        app.set('io', io);
        
        // Handle server shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            expressServer.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
    });
}

module.exports = { app, connection, expressServer };
