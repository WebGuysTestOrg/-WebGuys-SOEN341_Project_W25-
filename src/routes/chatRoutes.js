const express = require('express');
const chatController = require('../controllers/chatController');
const channelController = require('../controllers/channelController');

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

// Get channel messages
router.post('/api/get-channel-messages', channelController.getChannelMessages);

// Add other chat-related routes here later (e.g., get-messages)

module.exports = router; 