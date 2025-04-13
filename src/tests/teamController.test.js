// Mock db module before importing teamController
jest.mock('../config/db', () => require('./mockDb'));

const { resetMocks, mockQuery, mockPromisifiedQuery, mockBeginTransaction, mockCommit, mockRollback } = require('./mockDb');
const teamController = require('../controllers/teamController');

// Mock util.promisify
jest.mock('util', () => ({
  promisify: jest.fn((fn) => {
    if (fn === mockQuery) return mockPromisifiedQuery;
    if (fn === mockBeginTransaction) return jest.fn().mockResolvedValue(null);
    if (fn === mockCommit) return jest.fn().mockResolvedValue(null);
    if (fn === mockRollback) return jest.fn().mockResolvedValue(null);
    return jest.fn();
  })
}));

// Mock Express req and res objects
const mockReq = () => {
  const req = {};
  req.body = {};
  req.params = {};
  req.session = {};
  return req;
};

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Team Controller', () => {
  beforeEach(() => {
    resetMocks();
    
    // Set up default mock implementations for promisified functions
    mockPromisifiedQuery.mockImplementation(() => Promise.resolve([]));
  });

  describe('createTeam', () => {
    it('should return 403 if user is not authenticated', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;

      // Act
      await teamController.createTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Only Super Admin can create teams." });
    });

    it('should return 403 if user is not an admin', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1, user_type: 'user' };

      // Act
      await teamController.createTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Only Super Admin can create teams." });
    });

    it('should return 400 if team name is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1, user_type: 'admin' };
      req.body = {};

      // Act
      await teamController.createTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team name is required." });
    });

    it('should create a team successfully', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1, user_type: 'admin' };
      req.body = { teamName: 'New Team' };
      
      // Mock the first query to return team ID
      mockPromisifiedQuery.mockResolvedValueOnce({ insertId: 5 });
      
      // Mock the second query to succeed
      mockPromisifiedQuery.mockResolvedValueOnce({});

      // Act
      await teamController.createTeam(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        message: "Team created successfully!", 
        teamName: 'New Team' 
      });
    });

    it('should return 400 if team name already exists', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1, user_type: 'admin' };
      req.body = { teamName: 'Existing Team' };
      
      // Mock the query to throw a duplicate entry error
      const duplicateError = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      mockPromisifiedQuery.mockRejectedValueOnce(duplicateError);

      // Act
      await teamController.createTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team name already exists!" });
    });
  });

  describe('deleteTeam', () => {
    it('should return 401 if user is not authenticated', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;
      req.body = { teamId: 1 };

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return 400 if team ID is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = {};

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team ID is required." });
    });

    it('should return 404 if team is not found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { teamId: 999 };
      
      // Mock query to return empty results (team not found)
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Team not found." });
    });

    it('should return 403 if user is not team creator or admin', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 2, user_type: 'user' };
      req.body = { teamId: 1 };
      
      // Mock query to return team with different creator
      mockPromisifiedQuery.mockResolvedValueOnce([{ created_by: 1 }]);

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Only the team creator or an admin can delete a team." 
      });
    });

    it('should allow team creator to delete team', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1, user_type: 'user' };
      req.body = { teamId: 1 };
      
      // Mock query responses
      mockPromisifiedQuery.mockResolvedValueOnce([{ created_by: 1 }]); // Check creator
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]); // Get channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete messages
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete user channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete user teams
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete team

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        message: "Team and all associated channels successfully deleted." 
      });
    });
    
    it('should allow admin to delete team even if not creator', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 2, user_type: 'admin' };
      req.body = { teamId: 1 };
      
      // Mock query responses
      mockPromisifiedQuery.mockResolvedValueOnce([{ created_by: 1 }]); // Check creator (different user)
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]); // Get channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete messages
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete user channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete channels
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete user teams
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Delete team

      // Act
      await teamController.deleteTeam(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        message: "Team and all associated channels successfully deleted." 
      });
    });
  });

  describe('getUserTeams', () => {
    it('should return 401 if user is not authenticated', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;

      // Act
      await teamController.getUserTeams(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return user teams', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      
      // Mock query results
      const mockResults = [
        { 
          teamId: 1, 
          teamName: 'Team 1', 
          creatorName: 'Admin', 
          teamMemberName: 'User 1',
          channelId: 10,
          channelName: 'Channel 1',
          channelMemberName: 'User 1'
        },
        { 
          teamId: 1, 
          teamName: 'Team 1', 
          creatorName: 'Admin', 
          teamMemberName: 'User 2',
          channelId: 10,
          channelName: 'Channel 1',
          channelMemberName: 'User 2'
        }
      ];
      mockPromisifiedQuery.mockResolvedValueOnce(mockResults);

      // Act
      await teamController.getUserTeams(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith([
        {
          teamId: 1,
          teamName: 'Team 1',
          creatorName: 'Admin',
          members: ['User 1', 'User 2'],
          channels: {
            '10': {
              channelName: 'Channel 1',
              members: ['User 1', 'User 2']
            }
          }
        }
      ]);
    });
  });

  describe('assignUserToTeam', () => {
    it('should return 400 if team ID or user name is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamId: 1 }; // Missing userName

      // Act
      await teamController.assignUserToTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Team ID and User Name are required." 
      });
    });

    it('should return 400 if team is not found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamId: 999, userName: 'User' };
      
      // Mock query to return empty results (team not found)
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await teamController.assignUserToTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team not found." });
    });

    it('should return 400 if user is not found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamId: 1, userName: 'NonExistentUser' };
      
      // Mock first query to return team
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 1 }]);
      
      // Mock second query to return empty results (user not found)
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await teamController.assignUserToTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found." });
    });

    it('should return 400 if user is already in team', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamId: 1, userName: 'User' };
      
      // Mock queries
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 1 }]); // Team exists
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 5 }]); // User exists
      mockPromisifiedQuery.mockResolvedValueOnce([{ user_id: 5, team_id: 1 }]); // User already in team

      // Act
      await teamController.assignUserToTeam(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "User already assigned to this team." 
      });
    });

    it('should assign user to team successfully', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamId: 1, userName: 'User' };
      
      // Mock queries
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 1 }]); // Team exists
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 5 }]); // User exists
      mockPromisifiedQuery.mockResolvedValueOnce([]); // User not already in team
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Insert successful

      // Act
      await teamController.assignUserToTeam(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        message: "User successfully assigned to the team." 
      });
    });
  });

  describe('getTeamIdFromName', () => {
    it('should return 400 if team name is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = {};

      // Act
      await teamController.getTeamIdFromName(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team name is required." });
    });

    it('should return 404 if team is not found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamName: 'NonExistentTeam' };
      
      // Mock query to return empty results
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await teamController.getTeamIdFromName(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Team not found." });
    });

    it('should return team ID successfully', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamName: 'Team 1' };
      
      // Mock query to return team ID
      mockPromisifiedQuery.mockResolvedValueOnce([{ id: 5 }]);

      // Act
      await teamController.getTeamIdFromName(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ teamId: 5 });
    });
  });
}); 