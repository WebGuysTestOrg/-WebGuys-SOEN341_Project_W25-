const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const connection = require('../database/connection');

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
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
    const query = "SELECT * FROM user_form WHERE email = ? AND password = ?";

    connection.query(query, [email, hashedPassword], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (results.length > 0) {
            const user = results[0];
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
            };

            // Log login time
            const logQuery = "INSERT INTO user_activity_log (user_id, name) VALUES (?, ?)";
            connection.query(logQuery, [user.id, user.name], (logErr) => {
                if (logErr) console.error("Error logging login:", logErr);
            });

            if (user.user_type === "admin") {
                return res.json({ 
                    redirect: "/admin_page.html",
                    user: req.session.user
                });
            } else {
                return res.json({ 
                    redirect: "/user_page.html",
                    user: req.session.user
                });
            }
        } else {
            res.status(401).json({ error: "Invalid email or password." });
        }
    });
});

// Logout
router.get("/logout", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login_form.html");
    }

    const userId = req.session.user.id;

    // Update the logout timestamp for the latest login
    const updateLogoutQuery = `
        UPDATE user_activity_log 
        SET logout_time = CURRENT_TIMESTAMP 
        WHERE user_id = ? 
        ORDER BY login_time DESC 
        LIMIT 1
    `;

    connection.query(updateLogoutQuery, [userId], (err) => {
        if (err) {
            console.error("Error logging logout:", err);
            return res.status(500).json({ error: "Error logging out." });
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) {
                console.error("Error destroying session:", sessionErr);
                return res.status(500).json({ error: "Error logging out." });
            }
            res.redirect("/login_form.html");
        });
    });
});

// Update Password
router.post("/update-password", (req, res) => {
    const { newPassword, confirmPassword } = req.body;

    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

    const hashedPassword = crypto.createHash("md5").update(newPassword).digest("hex");
    const id = req.session.user.id;
    
    const updatePasswordQuery = "UPDATE user_form SET password = ? WHERE id = ?";

    connection.query(updatePasswordQuery, [hashedPassword, id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error updating password." });
        }
        res.status(200).json({ message: "Password updated successfully!" });
    });
});

module.exports = router; 