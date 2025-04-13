const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// Direct message pin/unpin routes
router.put('/messages/:id/pin', messageController.pinDirectMessage);
router.put('/messages/:id/unpin', messageController.unpinDirectMessage);
router.get('/messages/pinned', messageController.getPinnedDirectMessage);

// Channel message pin/unpin routes
router.put('/channel-messages/:id/pin', messageController.pinChannelMessage);
router.put('/channel-messages/:id/unpin', messageController.unpinChannelMessage);
router.get('/channel-messages/pinned', messageController.getPinnedChannelMessage);

router.post("/remove-message", messageController.removeMessage);

module.exports = router; 