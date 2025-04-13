const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const userController = require('../controllers/userController');
const teamController = require('../controllers/teamController');

// Public routes
router.post('/login', userController.login);

// Protected routes for all users
router.use(isAuthenticated);
router.post('/logout', userController.logout);
router.post('/update-password', userController.updatePassword);
router.post('/update-status', userController.userFunctions.updateStatus);
router.get('/teams', teamController.getUserTeams);
router.get('/channels', userController.userFunctions.getUserChannels);

// Admin-only routes
router.use('/admin', isAdmin);
router.post('/admin/create-team', userController.adminFunctions.createTeam);
router.post('/admin/remove-message', userController.adminFunctions.removeMessage);
router.post('/admin/remove-user', userController.adminFunctions.removeUserFromTeam);
router.post('/admin/approve-group-request', userController.adminFunctions.approveGroupRequest);
router.post('/admin/update-group-description', userController.adminFunctions.updateGroupDescription);
router.post('/admin/remove-group-member', userController.adminFunctions.removeGroupMember);

// Normal user routes
router.post('/join-team', userController.userFunctions.joinTeam);
router.post('/send-message', userController.userFunctions.sendMessage);
router.post('/request-join-group', userController.userFunctions.requestJoinGroup);
router.post('/leave-group', userController.userFunctions.leaveGroup);

module.exports = router; 