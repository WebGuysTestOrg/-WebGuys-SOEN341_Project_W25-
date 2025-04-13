const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
router.post('/create-team', teamController.createTeam);
router.delete('/:teamId', teamController.deleteTeam);
router.get('/all', teamController.getTeamsWithMembers);
router.get('/user-teams', teamController.getUserTeams);
router.post('/assign-user-to-team', teamController.assignUserToTeam);
router.post('/get-team-id-from-name', teamController.getTeamIdFromName);
router.delete('/:teamId/member/:userId', teamController.removeTeamMember);

module.exports = router; 