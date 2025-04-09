const express = require('express');
const router = express.Router();
const MessageManager = require('../socket/utils/messageManager');
const connection = require('../config/db');

const msgManager = new MessageManager(connection);

router.get('/group-messages/:groupId', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const messages = await msgManager.getGroupMessages(groupId);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ error: 'Failed to fetch group messages' });
    }
});

module.exports = router; 