const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const config = require("./config/config");
const sessionMiddleware = require("./middleware/session");
const { initializeSocket } = require("./socket/socket");
const connection = require("./database/connection");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const teamsRoutes = require("./routes/teams");
const groupsRoutes = require("./routes/groups");

const app = express();
let expressServer;

if (process.env.NODE_ENV !== "test") {
    expressServer = app.listen(config.PORT, () => {
        console.log(`Server running at http://localhost:${config.PORT}`);
    });
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", teamsRoutes);
app.use("/", groupsRoutes);

// Initialize Socket.IO
const io = initializeSocket(expressServer, sessionMiddleware);

module.exports = { app, io, connection, expressServer };
