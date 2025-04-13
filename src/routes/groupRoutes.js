const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

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

module.exports = router;
