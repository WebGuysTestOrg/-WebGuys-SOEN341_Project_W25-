const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');

// Create a new channel
router.post('/create-channel', channelController.createChannel);

// Get channels for a specific team
router.get('/team/:teamId', channelController.getChannels);

// Get channels for the current user
router.get('/user-channels', channelController.getUserChannels);
router.post('/assign-user-to-channel', channelController.assignUser);

// Get messages for a specific channel
router.get('/:channelId/messages', channelController.getChannelMessages);

// Send a message to a channel
router.post('/:channelId/messages', channelController.sendChannelMessage);

// Remove a message from a channel
router.post('/:channelId/messages/:messageId/delete', channelController.removeMessage);

module.exports = router; 