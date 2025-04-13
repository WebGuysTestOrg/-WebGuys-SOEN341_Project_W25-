const { connection } = require('../config/db');
const util = require('util');
const query = util.promisify(connection.query).bind(connection);

const messageController = {
    
    removeMessage: (req, res) => {
        const { messageId } = req.body;

        if (!messageId) {
            return res.status(400).json({ error: "Message ID is required." });
        }

        const query = `
            UPDATE channels_messages
            SET text = 'Removed by Admin'
            WHERE id = ?
        `;

        connection.query(query, [messageId], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Database update failed." });
            }

            res.json({ success: true });
        });
    },
    // Pin a direct message
    pinDirectMessage: async (req, res) => {
        try {
            const messageId = req.params.id;
            
            // Get message details
            const getMessageQuery = 'SELECT sender_id, recipient_id FROM direct_messages WHERE id = ?';
            const messageResults = await query(getMessageQuery, [messageId]);
            
            if (messageResults.length === 0) {
                return res.status(404).json({ error: 'Message not found' });
            }
            
            const { sender_id, recipient_id } = messageResults[0];
            
            // Unpin existing messages in this conversation
            const unpinQuery = `UPDATE direct_messages SET pinned = FALSE 
                WHERE (sender_id = ? AND recipient_id = ?) 
                    OR (sender_id = ? AND recipient_id = ?)`;
            await query(unpinQuery, [sender_id, recipient_id, recipient_id, sender_id]);
            
            // Pin the new message
            const pinQuery = 'UPDATE direct_messages SET pinned = TRUE WHERE id = ?';
            await query(pinQuery, [messageId]);
            
            res.json({ message: 'Message pinned successfully' });
        } catch (err) {
            console.error('Error pinning message:', err);
            res.status(500).json({ error: 'Error pinning message' });
        }
    },

    // Unpin a direct message
    unpinDirectMessage: async (req, res) => {
        try {
            const messageId = req.params.id;
            
            const unpinQuery = 'UPDATE direct_messages SET pinned = FALSE WHERE id = ?';
            await query(unpinQuery, [messageId]);
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error unpinning message:', err);
            res.status(500).json({ error: 'Failed to unpin message' });
        }
    },

    // Get pinned direct message for a conversation
    getPinnedDirectMessage: async (req, res) => {
        try {
            const { senderId, recipientId } = req.query;
            
            if (!senderId || !recipientId) {
                return res.status(400).json({ error: 'Missing senderId or recipientId in query' });
            }
            
            const queryString = `
                SELECT * FROM direct_messages 
                WHERE pinned = TRUE AND (
                    (sender_id = ? AND recipient_id = ?) 
                    OR 
                    (sender_id = ? AND recipient_id = ?)
                )
                LIMIT 1
            `;
            
            const results = await query(queryString, [senderId, recipientId, recipientId, senderId]);
            const pinnedMessage = results.length > 0 ? results[0] : null;
            
            res.json(pinnedMessage);
        } catch (err) {
            console.error('Error fetching pinned message:', err);
            res.status(500).json({ error: 'Database error' });
        }
    },

    // Pin a channel message
    pinChannelMessage: async (req, res) => {
        try {
            const messageId = req.params.id;
            
            const pinQuery = 'UPDATE channels_messages SET pinned = true WHERE id = ?';
            await query(pinQuery, [messageId]);
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error pinning channel message:', err);
            res.status(500).json({ error: 'Failed to pin message' });
        }
    },

    // Unpin a channel message
    unpinChannelMessage: async (req, res) => {
        try {
            const messageId = req.params.id;
            
            const unpinQuery = 'UPDATE channels_messages SET pinned = false WHERE id = ?';
            await query(unpinQuery, [messageId]);
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error unpinning channel message:', err);
            res.status(500).json({ error: 'Failed to unpin message' });
        }
    },

    // Get pinned channel message
    getPinnedChannelMessage: async (req, res) => {
        try {
            const { teamName, channelName } = req.query;
            
            if (!teamName || !channelName) {
                return res.status(400).json({ error: 'Missing teamName or channelName in query' });
            }
            
            const queryString = `
                SELECT * FROM channels_messages 
                WHERE pinned = true AND team_name = ? AND channel_name = ?
                ORDER BY created_at DESC LIMIT 1
            `;
            
            const results = await query(queryString, [teamName, channelName]);
            
            res.json(results[0] || null);
        } catch (err) {
            console.error('Error fetching pinned channel message:', err);
            res.status(500).json({ error: 'Failed to fetch pinned message' });
        }
    }
};

module.exports = messageController; 