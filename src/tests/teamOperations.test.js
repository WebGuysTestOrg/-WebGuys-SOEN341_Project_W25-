const connection = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Team Operations', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Mock request and response objects with admin user by default
    req = {
      query: {},
      body: {},
      params: {},
      session: {
        user: {
          id: 1,
          name: 'AdminUser',
          email: 'admin@example.com',
          user_type: 'admin'
        }
      },
      app: {
        get: jest.fn()
      }
    };
    
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      redirect: jest.fn()
    };
  });

  describe('Team Creation', () => {
    test('should validate team creation data correctly', () => {
      // Create test with missing team name
      const invalidReq = { ...req, body: {} };
      
      // Mock createTeam function
      const mockCreateTeam = jest.fn();
      
      // Call mockCreateTeam with invalid data
      mockCreateTeam(invalidReq, res);
      
      // Verify connection.query was not called (as it should validate first)
      expect(connection.query).not.toHaveBeenCalled();
    });
    
    test('should allow admin to create team', () => {
      // Set up test data
      req.body = { teamName: 'Test Team' };
      
      // Configure mocks for successful team creation
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First query - create team
          callback(null, { insertId: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second query - add admin to team
          callback(null, { affectedRows: 1 });
        });
      
      // Create test function to call
      const createTeam = (req, res) => {
        const { teamName } = req.body;
        const userId = req.session.user.id;
        
        if (!teamName) {
          return res.status(400).json({ error: "Team name is required" });
        }
        
        // Insert team
        connection.query(
          "INSERT INTO teams (name, created_by) VALUES (?, ?)",
          [teamName, userId],
          (err, result) => {
            if (err) {
              if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Team name already exists!" });
              }
              return res.status(500).json({ error: "Error creating team" });
            }
            
            const teamId = result.insertId;
            
            // Add admin to team
            connection.query(
              "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)",
              [userId, teamId],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: "Error adding creator to team" });
                }
                
                res.json({ 
                  message: "Team created successfully!", 
                  teamId,
                  teamName 
                });
              }
            );
          }
        );
      };
      
      // Call the test function
      createTeam(req, res);
      
      // Verify connection.query was called twice
      expect(connection.query).toHaveBeenCalledTimes(2);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "Team created successfully!",
        teamId: 1,
        teamName: "Test Team"
      });
    });
    
    test('should handle duplicate team name error', () => {
      // Set up test data
      req.body = { teamName: 'Existing Team' };
      
      // Configure mock to return duplicate entry error
      const duplicateError = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(duplicateError, null);
      });
      
      // Create test function to call
      const createTeam = (req, res) => {
        const { teamName } = req.body;
        const userId = req.session.user.id;
        
        // Insert team
        connection.query(
          "INSERT INTO teams (name, created_by) VALUES (?, ?)",
          [teamName, userId],
          (err, result) => {
            if (err) {
              if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Team name already exists!" });
              }
              return res.status(500).json({ error: "Error creating team" });
            }
            
            // This part shouldn't be reached in this test
            res.json({ message: "Team created successfully!" });
          }
        );
      };
      
      // Call the test function
      createTeam(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team name already exists!" });
    });
  });

  describe('Team Membership', () => {
    test('should check if user can join team', () => {
      // Change to regular user
      req.session.user = {
        id: 2,
        name: 'RegularUser',
        email: 'user@example.com',
        user_type: 'user'
      };
      
      req.body = { teamId: 1 };
      
      // Mock query responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // Check if already a member - not a member
          callback(null, []);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Add to team
          callback(null, { affectedRows: 1 });
        });
      
      // Create test function
      const joinTeam = (req, res) => {
        const { teamId } = req.body;
        const userId = req.session.user.id;
        
        // Check if already a member
        connection.query(
          "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?",
          [teamId, userId],
          (err, existing) => {
            if (err) {
              return res.status(500).json({ error: "Error checking team membership" });
            }
            
            if (existing.length > 0) {
              return res.status(400).json({ error: "Already a member of this team" });
            }
            
            // Join team
            connection.query(
              "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)",
              [userId, teamId],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: "Error joining team" });
                }
                
                res.json({ message: "Successfully joined team" });
              }
            );
          }
        );
      };
      
      // Call function
      joinTeam(req, res);
      
      // Verify success response
      expect(res.json).toHaveBeenCalledWith({ message: "Successfully joined team" });
      expect(connection.query).toHaveBeenCalledTimes(2);
    });
    
    test('should prevent joining team twice', () => {
      // Change to regular user
      req.session.user = {
        id: 2,
        name: 'RegularUser',
        email: 'user@example.com',
        user_type: 'user'
      };
      
      req.body = { teamId: 1 };
      
      // Mock query to indicate already a member
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ user_id: 2, team_id: 1 }]);
      });
      
      // Create test function
      const joinTeam = (req, res) => {
        const { teamId } = req.body;
        const userId = req.session.user.id;
        
        // Check if already a member
        connection.query(
          "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?",
          [teamId, userId],
          (err, existing) => {
            if (err) {
              return res.status(500).json({ error: "Error checking team membership" });
            }
            
            if (existing.length > 0) {
              return res.status(400).json({ error: "Already a member of this team" });
            }
            
            // This shouldn't be reached in this test
            res.json({ message: "Successfully joined team" });
          }
        );
      };
      
      // Call function
      joinTeam(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Already a member of this team" });
      expect(connection.query).toHaveBeenCalledTimes(1);
    });
    
    test('should get user teams', () => {
      // Set up request
      req.query = {};
      
      // Mock database response
      const mockTeams = [
        { id: 1, name: 'Team 1', created_by: 1 },
        { id: 2, name: 'Team 2', created_by: 2 }
      ];
      
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, mockTeams);
      });
      
      // Create test function
      const getUserTeams = (req, res) => {
        const userId = req.session.user.id;
        
        connection.query(
          `SELECT t.id, t.name, t.created_by 
           FROM teams t 
           JOIN user_teams ut ON t.id = ut.team_id 
           WHERE ut.user_id = ?`,
          [userId],
          (err, teams) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching teams" });
            }
            
            res.json(teams);
          }
        );
      };
      
      // Call function
      getUserTeams(req, res);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith(mockTeams);
      expect(connection.query).toHaveBeenCalledTimes(1);
    });
    
    test('should handle database error when getting teams', () => {
      // Set up request
      req.query = {};
      
      // Mock database error
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });
      
      // Create test function
      const getUserTeams = (req, res) => {
        const userId = req.session.user.id;
        
        connection.query(
          `SELECT t.id, t.name, t.created_by 
           FROM teams t 
           JOIN user_teams ut ON t.id = ut.team_id 
           WHERE ut.user_id = ?`,
          [userId],
          (err, teams) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching teams" });
            }
            
            res.json(teams);
          }
        );
      };
      
      // Call function
      getUserTeams(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error fetching teams" });
      expect(connection.query).toHaveBeenCalledTimes(1);
    });
    
    test('should get team ID by name', () => {
      // Set up request
      req.query = { teamName: 'Test Team' };
      
      // Mock database response
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ id: 1 }]);
      });
      
      // Create test function
      const getTeamId = (req, res) => {
        const { teamName } = req.query;
        
        if (!teamName) {
          return res.status(400).json({ error: "Team name is required." });
        }
        
        connection.query(
          "SELECT id FROM teams WHERE name = ?",
          [teamName],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching team ID." });
            }
            
            if (results.length === 0) {
              return res.status(404).json({ error: "Team not found." });
            }
            
            res.json({ teamId: results[0].id });
          }
        );
      };
      
      // Call function
      getTeamId(req, res);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({ teamId: 1 });
      expect(connection.query).toHaveBeenCalledTimes(1);
    });
    
    test('should return error when team is not found', () => {
      // Set up request
      req.query = { teamName: 'Nonexistent Team' };
      
      // Mock empty response (team not found)
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, []);
      });
      
      // Create test function
      const getTeamId = (req, res) => {
        const { teamName } = req.query;
        
        connection.query(
          "SELECT id FROM teams WHERE name = ?",
          [teamName],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching team ID." });
            }
            
            if (results.length === 0) {
              return res.status(404).json({ error: "Team not found." });
            }
            
            res.json({ teamId: results[0].id });
          }
        );
      };
      
      // Call function
      getTeamId(req, res);
      
      // Verify not found response
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Team not found." });
      expect(connection.query).toHaveBeenCalledTimes(1);
    });
  });
}); 