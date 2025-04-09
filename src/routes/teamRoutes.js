const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Create a new team
router.post('/create', teamController.createTeam);

// Delete a team
router.delete('/:teamId', teamController.deleteTeam);

// Get all teams with their members
router.get('/all', teamController.getTeamsWithMembers);

// Get teams for a specific user
router.get('/user', teamController.getUserTeams);

// Assign a user to a team
router.post('/assign', teamController.assignUserToTeam);

// Remove a team member
router.delete('/:teamId/member/:userId', teamController.removeTeamMember);

module.exports = router; 