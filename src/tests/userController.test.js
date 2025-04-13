// Mock db module before importing userController
jest.mock('../config/db', () => require('./mockDb'));

// Mock crypto module
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('hashed_password')
}));

const { resetMocks, mockQuery } = require('./mockDb');
const userController = require('../controllers/userController');

// Mock Express req and res objects
const mockReq = () => {
  const req = {};
  req.body = {};
  req.params = {};
  req.session = {};
  req.app = {
    get: jest.fn().mockReturnValue({
      emit: jest.fn()
    })
  };
  return req;
};

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

describe('User Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('login', () => {
    it('should return 401 if user not found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com', password: 'password123' };
      
      // Mock database to return empty results (user not found)
      mockQuery.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      // Act
      await userController.login(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid email or password." });
    });

    it('should set session and redirect to dashboard for successful login', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com', password: 'password123' };
      
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        user_type: 'user'
      };

      // Set up mock behavior for database queries
      let queryCount = 0;
      mockQuery.mockImplementation((sql, params, callback) => {
        if (queryCount === 0) {
          // First query - user lookup
          callback(null, [mockUser]);
        } else {
          // Second query - logging login
          callback(null, { affectedRows: 1 });
        }
        queryCount++;
      });

      // Act
      await userController.login(req, res);

      // Assert
      expect(req.session.user).toEqual({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        user_type: 'user'
      });
      expect(res.json).toHaveBeenCalledWith({
        redirect: "/UserDashboard.html",
        user: req.session.user
      });
    });

    it('should handle server errors during login', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com', password: 'password123' };
      
      // Mock query to throw an error
      mockQuery.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'), null);
      });

      // Act
      await userController.login(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });
  });

  describe('updatePassword', () => {
    it('should return 401 if user is not logged in', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;
      req.body = { newPassword: 'newPassword123', confirmPassword: 'newPassword123' };

      // Act
      await userController.updatePassword(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return 400 if passwords do not match', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { newPassword: 'newPassword123', confirmPassword: 'differentPassword' };

      // Act
      await userController.updatePassword(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Passwords do not match!" });
    });

    it('should update password successfully', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { newPassword: 'newPassword123', confirmPassword: 'newPassword123' };
      
      // Mock query to succeed
      mockQuery.mockImplementation((sql, params, callback) => {
        callback(null, { affectedRows: 1 });
      });

      // Act
      await userController.updatePassword(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Password updated successfully!" });
    });
  });

  describe('Admin Functions', () => {
    describe('createTeam', () => {
      it('should create a team successfully', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { teamName: 'New Team' };
        
        // Set up mock behavior for database queries
        let queryCount = 0;
        mockQuery.mockImplementation((sql, params, callback) => {
          if (queryCount === 0) {
            // First query - insert team
            callback(null, { insertId: 5 });
          } else {
            // Second query - add user to team
            callback(null, { affectedRows: 1 });
          }
          queryCount++;
        });

        // Act
        await userController.adminFunctions.createTeam(req, res);

        // Assert
        expect(res.json).toHaveBeenCalledWith({ 
          message: "Team created successfully!", 
          teamName: 'New Team' 
        });
      });

      it('should handle database errors', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { teamName: 'New Team' };
        
        // Mock query to throw an error
        mockQuery.mockImplementation((sql, params, callback) => {
          callback(new Error('Database error'), null);
        });

        // Act
        await userController.adminFunctions.createTeam(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Error creating team" });
      });
    });

    describe('removeMessage', () => {
      it('should remove a message successfully', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.body = { messageId: 123 };
        
        // Mock query to succeed
        mockQuery.mockImplementation((sql, params, callback) => {
          callback(null, { affectedRows: 1 });
        });

        // Act
        await userController.adminFunctions.removeMessage(req, res);

        // Assert
        expect(res.json).toHaveBeenCalledWith({ success: true });
      });
    });

    describe('removeUserFromTeam', () => {
      it('should not allow removing team creator', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.body = { teamId: 1, userId: 5 };
        
        // Mock first query to return team with creator = userId
        mockQuery.mockImplementationOnce((sql, params, callback) => {
          callback(null, [{ created_by: 5 }]);
        });

        // Act
        await userController.adminFunctions.removeUserFromTeam(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ 
          error: "Cannot remove team creator from their own team" 
        });
      });

      it('should remove user from team successfully', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.body = { teamId: 1, userId: 5 };
        
        // Set up mock behavior for database queries
        let queryCount = 0;
        mockQuery.mockImplementation((sql, params, callback) => {
          if (queryCount === 0) {
            // First query - check if creator
            callback(null, [{ created_by: 1 }]);
          } else {
            // Second query - remove user from team
            callback(null, { affectedRows: 1 });
          }
          queryCount++;
        });

        // Act
        await userController.adminFunctions.removeUserFromTeam(req, res);

        // Assert
        expect(res.json).toHaveBeenCalledWith({ 
          message: "User removed from team successfully" 
        });
      });
    });
  });

  describe('User Functions', () => {
    describe('joinTeam', () => {
      it('should not allow joining team if already a member', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { teamId: 5 };
        
        // Mock query to return existing membership
        mockQuery.mockImplementation((sql, params, callback) => {
          callback(null, [{ user_id: 1, team_id: 5 }]);
        });

        // Act
        await userController.userFunctions.joinTeam(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ 
          error: "Already a member of this team" 
        });
      });

      it('should join team successfully', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { teamId: 5 };
        
        // Set up mock behavior for database queries
        let queryCount = 0;
        mockQuery.mockImplementation((sql, params, callback) => {
          if (queryCount === 0) {
            // First query - check existing membership
            callback(null, []);
          } else {
            // Second query - add to team
            callback(null, { affectedRows: 1 });
          }
          queryCount++;
        });

        // Act
        await userController.userFunctions.joinTeam(req, res);

        // Assert
        expect(res.json).toHaveBeenCalledWith({ 
          message: "Successfully joined team" 
        });
      });
    });

    describe('updateStatus', () => {
      it('should update user status successfully', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { status: 'away' };
        
        // Mock query to succeed
        mockQuery.mockImplementation((sql, params, callback) => {
          callback(null, { affectedRows: 1 });
        });

        // Act
        await userController.userFunctions.updateStatus(req, res);

        // Assert
        expect(res.json).toHaveBeenCalledWith({ 
          message: "Status updated successfully" 
        });
        expect(req.app.get().emit).toHaveBeenCalledWith('userStatusUpdate', {
          userId: 1,
          status: 'away'
        });
      });
    });

    describe('leaveGroup', () => {
      it('should not allow group creator to leave', async () => {
        // Arrange
        const req = mockReq();
        const res = mockRes();
        req.session.user = { id: 1 };
        req.body = { groupId: 5 };
        
        // Mock query to return group with creator = userId
        mockQuery.mockImplementation((sql, params, callback) => {
          callback(null, [{ created_by: 1 }]);
        });

        // Act
        await userController.userFunctions.leaveGroup(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ 
          error: "As the owner, you cannot leave your own group" 
        });
      });
    });
  });
}); 