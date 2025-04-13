const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const MessageManager = require('../socket/utils/messageManager');
const { connection } = require('../config/db');

// Create message manager instance
const msgManager = new MessageManager(connection);

// Your routes:
router.post('/create-group', groupController.createGroup);
router.post('/add-user', groupController.addUserToGroup);
router.get('/get-groups', groupController.getGroups);
router.get('/group-members/:groupId', groupController.getGroupMembers);
router.get('/group-owner/:groupId', groupController.getGroupOwner);
router.get('/group-requests/:groupId', groupController.getGroupRequests);
router.post('/request-join', groupController.requestJoin);
router.post('/approve-user', groupController.approveUser);
router.post('/leave-group', groupController.leaveGroup);
router.post('/update-group-description', groupController.updateGroupDescription);
router.post('/remove-group-member', groupController.removeGroupMember);

// Add route for group messages
router.get('/group-messages/:groupId', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        console.log(`Fetching messages for group ${groupId}`);
        const messages = await msgManager.getGroupMessages(groupId);
        console.log(`Found ${messages.length} messages for group ${groupId}`);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ error: 'Failed to fetch group messages' });
    }
});

module.exports = router;
