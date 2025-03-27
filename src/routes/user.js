const express = require('express');
const router = express.Router();
const connection = require('../database/connection');
const { protectRoute } = require('../middleware/routeProtection');

// Get user info for session verification
router.get('/user-info', protectRoute, (req, res) => {
    console.log('User-info route accessed. Session:', req.session);
    
    if (!req.session || !req.session.user) {
        console.log('No session or user found in user-info route');
        return res.status(401).json({ error: 'No active session' });
    }

    try {
        const userInfo = {
            id: req.session.user.id,
            name: req.session.user.name,
            email: req.session.user.email,
            user_type: req.session.user.user_type
        };
        console.log('Sending user info:', userInfo);
        res.json(userInfo);
    } catch (error) {
        console.error('Error in user-info route:', error);
        res.status(500).json({ error: 'Error retrieving user info' });
    }
});

// Get admin info
router.get("/admin-info", protectRoute, (req, res) => {
    if (req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name });
});

// Get user ID from username
router.get("/get-user-id", (req, res) => {
    const { username } = req.query;
    const query = "SELECT id FROM user_form WHERE name = ?";
    connection.query(query, [username], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (results.length === 0) return res.status(404).json({ error: "User not found." });
        res.json({ userId: results[0].id });
    });
});

// Get user chats
router.get('/get-user-chats', (req, res) => {
    const { userId } = req.query;
    const query = `
        SELECT DISTINCT uf.id AS user_id, uf.name AS username
        FROM direct_messages dm
        JOIN user_form uf ON (dm.sender_id = uf.id OR dm.recipient_id = uf.id)
        WHERE (dm.sender_id = ? OR dm.recipient_id = ?) AND uf.id != ?
    `;

    connection.query(query, [userId, userId, userId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error fetching chats." });
        }
        res.json(results);
    });
});

// Get messages between users
router.get('/get-messages', (req, res) => {
    const { senderId, recipientId } = req.query;
    
    const query = `
        SELECT dm.text, dm.quoted_message, dm.sender_id, dm.recipient_id, uf.name AS senderName
        FROM direct_messages dm
        JOIN user_form uf ON dm.sender_id = uf.id
        WHERE (dm.sender_id = ? AND dm.recipient_id = ?)
           OR (dm.sender_id = ? AND dm.recipient_id = ?)
        ORDER BY dm.timestamp
    `;

    connection.query(query, [senderId, recipientId, recipientId, senderId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Error fetching messages." });
        }
        const formattedResults = results.map(msg => ({
            id: msg.id,
            senderId: msg.sender_id,
            recipientId: msg.recipient_id,
            senderName: msg.senderName,
            text: msg.text,
            quoted: msg.quoted_message ? { text: msg.quoted_message } : null
        }));

        res.json(formattedResults);
    });
});

// Get all users and their activity
router.get("/api/users", (req, res) => {
    const sqlAllUsers = `SELECT DISTINCT name FROM user_activity_log`;
    const sqlLogoutTimes = `
        SELECT name, MAX(logout_time) AS last_logout 
        FROM user_activity_log 
        GROUP BY name
    `;

    connection.query(sqlAllUsers, (err, allUsers) => {
        if (err) {
            console.error("Error fetching users:", err);
            return res.status(500).json({ error: "Database error" });
        }

        connection.query(sqlLogoutTimes, (err, logoutTimes) => {
            if (err) {
                console.error("Error fetching logout times:", err);
                return res.status(500).json({ error: "Database error" });
            }

            res.json({
                all_users: allUsers,
                user_logout_times: logoutTimes
            });
        });
    });
});

module.exports = router; 