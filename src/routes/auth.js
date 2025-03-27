const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const connection = require('../database/connection');
const AuthService = require('../services/authService');

// Error handling middleware for session errors
const handleSessionError = (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    console.error('Session error:', err);
    next(err);
};

// User Registration
router.post("/register", (req, res) => {
    const { name, email, password, cpassword, user_type } = req.body;

    // Full field validation
    if (!name || !email || !password || !cpassword || !user_type) {
        return res.status(400).json({ error: "All fields are required." });
    }

    // Email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format." });
    }

    // Passwords match check
    if (password !== cpassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

    // Check if email is already registered
    const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
    connection.query(checkEmailQuery, [email], (err, emailResults) => {
        if (err) {
            console.error("Email check error:", err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (emailResults.length > 0) {
            return res.status(400).json({ error: "Email is already in use!" });
        }

        // Check if username is already taken
        const checkUsernameQuery = "SELECT id FROM user_form WHERE name = ?";
        connection.query(checkUsernameQuery, [name], (err, nameResults) => {
            if (err) {
                console.error("Username check error:", err);
                return res.status(500).json({ error: "Server error. Please try again later." });
            }

            if (nameResults.length > 0) {
                return res.status(400).json({ error: "Username is already in use!" });
            }

            // Hash password & insert user
            const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
            const insertQuery = "INSERT INTO user_form (name, email, password, user_type) VALUES (?, ?, ?, ?)";

            connection.query(insertQuery, [name, email, hashedPassword, user_type], (err) => {
                if (err) {
                    console.error("Insert error:", err);
                    return res.status(500).json({ error: "Error registering user." });
                }
                res.status(200).json({ redirect: "/login_form.html" });
            });
        });
    });
});

// Login
router.post("/login", async (req, res) => {
    try {
        console.log('Login request received');
        const { email, password } = req.body;
        console.log('Login attempt for email:', email);

        const loginResult = await AuthService.login(email, password);
        console.log('Login result:', loginResult);

        if (!loginResult.success) {
            console.log('Login failed:', loginResult.error);
            return res.status(loginResult.statusCode).json({ error: loginResult.error });
        }

        // Set session with error handling
        try {
            console.log('Setting session for user:', loginResult.user);
            req.session.user = loginResult.user;
            console.log('Session after setting:', req.session);
        } catch (sessionError) {
            console.error('Session error during login:', sessionError);
            return res.status(500).json({ error: 'Error setting up session' });
        }

        // Determine redirect based on user type
        const redirect = loginResult.user.user_type === "admin" 
            ? "/admin_page.html" 
            : "/user_page.html";

        console.log('Login successful, redirecting to:', redirect);
        return res.json({ 
            redirect,
            user: loginResult.user
        });
    } catch (error) {
        console.error("Login route error:", error);
        return res.status(500).json({ error: "An unexpected error occurred." });
    }
});

// Logout
router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({ error: "Error logging out" });
        }
        res.clearCookie('sessionId');
        res.json({ redirect: "/login_form.html" });
    });
});

// Update Password
router.post("/update-password", async (req, res) => {
    try {
        const sessionResult = await AuthService.validateSession(req.session);
        if (!sessionResult.success) {
            return res.status(sessionResult.statusCode).json({ error: sessionResult.error });
        }

        const { newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match!" });
        }

        const hashedPassword = crypto.createHash("md5").update(newPassword).digest("hex");
        const id = sessionResult.user.id;
        
        const updatePasswordQuery = "UPDATE user_form SET password = ? WHERE id = ?";

        connection.query(updatePasswordQuery, [hashedPassword, id], (err, result) => {
            if (err) {
                console.error("Password update error:", err);
                return res.status(500).json({ error: "Error updating password." });
            }
            res.status(200).json({ message: "Password updated successfully!" });
        });
    } catch (error) {
        console.error("Update password route error:", error);
        return res.status(500).json({ error: "An unexpected error occurred." });
    }
});

// Apply session error handling to all routes
router.use(handleSessionError);

module.exports = router; 