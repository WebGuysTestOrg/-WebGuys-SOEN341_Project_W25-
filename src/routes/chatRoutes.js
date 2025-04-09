const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

// Define route for getting user chat list
// GET /get-user-chats?userId=...
router.get('/get-user-chats', chatController.getUserChats);

// Define route for initializing a direct chat
// POST /init-chat
router.post('/init-chat', chatController.initChat);

// GET /get-messages?senderId=...&recipientId=...
router.get('/get-messages', chatController.getDirectMessages);

// GET /get-user-id?username=...
router.get('/get-user-id', chatController.getUserIdByName);

// Mock function to simulate fetching messages
function fetchChannelMessages(teamName, channelName) {
    // Replace with actual logic to fetch messages from a database
    return [
        { sender: 'User1', text: 'Hello!' },
        { sender: 'User2', text: 'Hi there!' }
    ];
}

router.post('/api/get-channel-messages', (req, res) => {
    const { teamName, channelName } = req.body;
    if (!teamName || !channelName) {
        return res.status(400).json({ error: 'Team name and channel name are required.' });
    }

    const messages = fetchChannelMessages(teamName, channelName);
    res.json(messages);
});

// Add other chat-related routes here later (e.g., get-messages)

module.exports = router; 