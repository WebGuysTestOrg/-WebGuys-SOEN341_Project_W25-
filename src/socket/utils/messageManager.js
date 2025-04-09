class MessageManager {
    constructor(connection) {
        this.connection = connection;
    }

    // Global Messages
    async saveGlobalMessage(message) {
        const query = `
            INSERT INTO global_messages 
            (sender_id, sender_name, message, quoted_text, quoted_sender, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        return this.query(query, [
            message.sender_id,
            message.sender_name,
            message.message,
            message.quoted_text,
            message.quoted_sender,
            message.timestamp
        ]);
    }

    async getGlobalMessages(limit = 50) {
        const query = `
            SELECT gm.*, uf.name as sender_name 
            FROM global_messages gm
            JOIN user_form uf ON gm.sender_id = uf.id
            ORDER BY gm.timestamp DESC
            LIMIT ?
        `;
        return this.query(query, [limit]);
    }

    // Private Messages
    async savePrivateMessage(message) {
        const query = `
            INSERT INTO direct_messages 
            (sender_id, recipient_id, text, timestamp) 
            VALUES (?, ?, ?, ?)
        `;
        return this.query(query, [
            message.sender_id,
            message.recipient_id,
            message.text,
            message.timestamp
        ]);
    }

    // Channel Messages
    async saveChannelMessage(message) {
        const query = `
            INSERT INTO channels_messages 
            (team_name, channel_name, sender, text, quoted_message) 
            VALUES (?, ?, ?, ?, ?)
        `;
        return this.query(query, [
            message.team_name,
            message.channel_name,
            message.sender,
            message.text,
            message.quoted_message
        ]);
    }

    async getChannelMessages(teamName, channelName) {
        const query = `
            SELECT id, sender, text, quoted_message 
            FROM channels_messages 
            WHERE team_name = ? AND channel_name = ? 
            ORDER BY created_at ASC
        `;
        return this.query(query, [teamName, channelName]);
    }

    // Group Messages
    async saveGroupMessage(message) {
        const query = `
            INSERT INTO group_messages 
            (group_id, user_id, text, is_system_message) 
            VALUES (?, ?, ?, ?)
        `;
        return this.query(query, [
            message.group_id,
            message.user_id,
            message.text,
            message.is_system_message || 0
        ]);
    }

    async getGroupMessages(groupId) {
        const query = `
            SELECT u.name AS sender, gm.text, gm.is_system_message
            FROM group_messages gm 
            JOIN user_form u ON gm.user_id = u.id 
            WHERE gm.group_id = ?
            ORDER BY gm.created_at ASC
        `;
        return this.query(query, [groupId]);
    }

    // Helper method for database queries
    query(query, params) {
        return new Promise((resolve, reject) => {
            this.connection.query(query, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }
}

module.exports = MessageManager; 