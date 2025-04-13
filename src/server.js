const crypto = require("crypto");
const sharedSession = require("express-socket.io-session"); 
const { connection } = require('./config/db');
const { app, sessionMiddleware } = require('./app');
const { initializeSocketServer } = require('./socket/utils/socketManager');
  

const PORT = process.env.PORT || 3000;
let expressServer;

// =============================================
// SERVER INITIALIZATION & APP CONFIGURATION - REVISED
// =============================================

// Start the server (using the imported app)
if (process.env.NODE_ENV !== "test") {
    expressServer = app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
    
    // Initialize Socket.IO with the Express server
    const io = initializeSocketServer(expressServer, sessionMiddleware, sharedSession, connection);
}

// =============================================
// AUTHENTICATION AND USER MANAGEMENT ROUTES
// =============================================

app.get("/api/users", (req, res) => {
    const sqlAllUsers = `SELECT DISTINCT user_activity_log.name, user_form.id FROM user_activity_log 
                        JOIN user_form ON user_activity_log.name = user_form.name`;
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

app.put('/api/messages/:id/pin', (req, res) => {
    const messageId = req.params.id;
    getMessageDetails(messageId, res);
});

// Helper function to get message details
function getMessageDetails(messageId, res) {
    connection.query(
        'SELECT sender_id, recipient_id FROM direct_messages WHERE id = ?',
        [messageId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'Message not found' });
            }

            const { sender_id, recipient_id } = results[0];
            unpinExistingMessages(messageId, sender_id, recipient_id, res);
        }
    );
}

// Helper function to unpin existing messages
function unpinExistingMessages(messageId, sender_id, recipient_id, res) {
            connection.query(
                `UPDATE direct_messages SET pinned = FALSE 
                 WHERE (sender_id = ? AND recipient_id = ?) 
                    OR (sender_id = ? AND recipient_id = ?)`,
                [sender_id, recipient_id, recipient_id, sender_id],
                (unpinErr) => {
                    if (unpinErr) {
                        console.error(unpinErr);
                        return res.status(500).json({ error: 'Error unpinning old messages' });
                    }

            pinNewMessage(messageId, res);
        }
    );
}
                   
// Helper function to pin new message
function pinNewMessage(messageId, res) {
                    connection.query(
                        'UPDATE direct_messages SET pinned = TRUE WHERE id = ?',
                        [messageId],
                        (pinErr) => {
                            if (pinErr) {
                                console.error(pinErr);
                                return res.status(500).json({ error: 'Error pinning message' });
                            }

                            res.json({ message: 'Message pinned successfully' });
                        }
                    );
                }

app.get('/api/messages/pinned', (req, res) => {
    const { senderId, recipientId } = req.query;

    if (!senderId || !recipientId) {
        return res.status(400).json({ error: 'Missing senderId or recipientId in query' });
    }

    const query = `
        SELECT * FROM direct_messages 
        WHERE pinned = TRUE AND (
            (sender_id = ? AND recipient_id = ?) 
            OR 
            (sender_id = ? AND recipient_id = ?)
        )
        LIMIT 1
    `;

    connection.query(query, [senderId, recipientId, recipientId, senderId], (err, results) => {
        if (err) {
            console.error('Error fetching pinned message:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const pinnedMessage = results.length > 0 ? results[0] : null;
        res.json(pinnedMessage);
    });
});

app.put('/api/messages/:id/unpin', (req, res) => {
    const messageId = req.params.id;

    connection.query(
        'UPDATE direct_messages SET pinned = FALSE WHERE id = ?',
        [messageId],
        (err, results) => {
            if (err) {
                console.error("Error unpinning message:", err);
                return res.status(500).json({ error: 'Failed to unpin message' });
            }

            res.json({ success: true });
        }
    );
});

app.put('/api/channel-messages/:id/pin', (req, res) => {
    const messageId = req.params.id;

    connection.query(`
        UPDATE channels_messages SET pinned = true WHERE id = ?
    `, [messageId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to pin message' });
        res.json({ success: true });
    });
});

app.put('/api/channel-messages/:id/unpin', (req, res) => {
    const messageId = req.params.id;

    connection.query(`
        UPDATE channels_messages SET pinned = false WHERE id = ?
    `, [messageId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to unpin message' });
        res.json({ success: true });
    });
});

app.get('/api/channel-messages/pinned', (req, res) => {
    const { teamName, channelName } = req.query;

    connection.query(`
        SELECT * FROM channels_messages 
        WHERE pinned = true AND team_name = ? AND channel_name = ?
        ORDER BY created_at DESC 
    `, [teamName, channelName], (err, results) => {
        console.log(results)
        if (err) return res.status(500).json({ error: 'Failed to fetch pinned message' });
        res.json(results || null);
    });
});

// Export the app and connection for testing
module.exports = {
    app,
    connection
};