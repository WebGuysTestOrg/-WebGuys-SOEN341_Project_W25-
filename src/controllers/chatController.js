// Import the database connection
const connection = require('../config/db');

// Controller function to get user chat list
const getUserChats = (req, res) => {
    const { userId } = req.query;

    // Basic validation: Check if userId is provided
    if (!userId) {
        return res.status(400).json({ error: "User ID is required in query parameters." });
    }

    // The SQL query to fetch distinct chat partners
    const query = `
        SELECT DISTINCT uf.id AS user_id, uf.name AS username
        FROM direct_messages dm
        JOIN user_form uf ON (dm.sender_id = uf.id OR dm.recipient_id = uf.id)
        WHERE (dm.sender_id = ? OR dm.recipient_id = ?) AND uf.id != ?
        ORDER BY uf.name ASC -- Optional: Order results alphabetically
    `;

    connection.query(query, [userId, userId, userId], (err, results) => {
        if (err) {
            console.error("Database error fetching user chats:", err);
            // Send a generic server error message
            return res.status(500).json({ error: "Database error fetching chats." });
        }
        // Send the list of users
        res.json(results);
    });
};

// Controller function to initialize a direct chat
const initChat = (req, res) => {
    const { userId, recipientId } = req.body;
    
    // Validate input
    if (!userId || !recipientId) {
        return res.status(400).json({ error: "Both user IDs (userId, recipientId) are required in the request body." });
    }
    
    // First check if a message already exists between these users
    const checkQuery = `
        SELECT id FROM direct_messages 
        WHERE (sender_id = ? AND recipient_id = ?) 
        OR (sender_id = ? AND recipient_id = ?)
        LIMIT 1
    `;
    
    connection.query(checkQuery, [userId, recipientId, recipientId, userId], (err, results) => {
        if (err) {
            console.error("Database error checking existing messages:", err);
            return res.status(500).json({ error: "Database error checking messages." });
        }
        
        if (results.length > 0) {
            // Messages already exist, no need to initialize
            return res.json({ success: true, message: "Chat already exists" });
        }
        
        // If no messages exist, create a system message to initialize the chat
        // Note: Using original query which doesn't explicitly set timestamp
        const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text) VALUES (?, ?, ?)";
        const systemMessage = "Chat initialized";
        
        connection.query(insertQuery, [userId, recipientId, systemMessage], (err, result) => {
            if (err) {
                console.error("Database error initializing chat:", err);
                return res.status(500).json({ error: "Failed to initialize chat." });
            }
            
            res.json({ success: true, message: "Chat initialized successfully" });
        });
    });
};

// Controller function to get direct message history between two users
const getDirectMessages = (req, res) => {
    const { senderId, recipientId } = req.query;
    
    // Validate input
    if (!senderId || !recipientId) {
        return res.status(400).json({ error: "Both senderId and recipientId are required in query parameters." });
    }
    
    // Query to fetch messages, joining to get sender's name
    // Uses only fields present in the original schema (excluding quoted)
    const query = `
        SELECT dm.id, dm.text, dm.sender_id, dm.recipient_id, dm.timestamp, uf.name AS senderName
        FROM direct_messages dm
        JOIN user_form uf ON dm.sender_id = uf.id
        WHERE (dm.sender_id = ? AND dm.recipient_id = ?)
           OR (dm.sender_id = ? AND dm.recipient_id = ?)
        ORDER BY dm.timestamp
    `;

    connection.query(query, [senderId, recipientId, recipientId, senderId], (err, results) => {
        if (err) {
            console.error("Error fetching direct messages:", err);
            return res.status(500).json({ error: "Error fetching messages." });
        }
        
        // Format results to match expected client structure
        const formattedResults = results.map(msg => ({
            id: msg.id,
            senderId: msg.sender_id,
            recipientId: msg.recipient_id,
            senderName: msg.senderName,
            text: msg.text,
            timestamp: msg.timestamp,
            // Exclude quoted field as it's not stored in DB
        }));

        res.json(formattedResults);
    });
};

// Controller function to get user ID by username
const getUserIdByName = (req, res) => {
    const { username } = req.query;

    // Validate input
    if (!username) {
        return res.status(400).json({ error: "Username is required in query parameters." });
    }

    const query = "SELECT id FROM user_form WHERE name = ?";
    
    connection.query(query, [username], (err, results) => {
        if (err) {
            console.error("Database error fetching user ID by name:", err);
            return res.status(500).json({ error: "Database error." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }
        res.json({ userId: results[0].id });
    });
};

// Export the controller functions
module.exports = {
    getUserChats,
    initChat,
    getDirectMessages,
    getUserIdByName,
}; 