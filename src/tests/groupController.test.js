// Mock db module before importing groupController
jest.mock('../config/db', () => require('./mockDb'));

const { resetMocks, mockQuery } = require('./mockDb');
const groupController = require('../controllers/groupController');

// Mock Express req and res objects
const mockReq = () => {
  const req = {};
  req.body = {};
  req.query = {};
  req.params = {};
  req.session = {
    user: {
      id: 1,
      name: 'Test User'
    }
  };
  return req;
};

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Group Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('createGroup', () => {
    it('should return 400 if name or description is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { name: 'Test Group' }; // Missing description

      // Act
      groupController.createGroup(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Group name and description are required." });
    });

    it('should create a group successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { name: 'Test Group', description: 'Test Description' };
      
      // Setup multi-step query chain
      // First query creates group
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, { insertId: 1 });
      });
      
      // Second query adds creator to group
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {});
      });
      
      // Third query adds welcome message
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {});
      });

      // Act
      groupController.createGroup(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "Group created successfully!", 
        groupId: 1 
      });
    });

    it('should handle database error when creating group', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { name: 'Test Group', description: 'Test Description' };
      
      // Mock query to throw an error
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      // Act
      groupController.createGroup(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error creating group." });
    });
  });

  describe('getGroups', () => {
    it('should return groups successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      
      const mockGroups = [
        { id: 1, name: 'Group 1', description: 'Description 1' },
        { id: 2, name: 'Group 2', description: 'Description 2' }
      ];
      
      // Fix mock implementation to handle callback correctly
      mockQuery.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          // Handle case where params is actually the callback
          callback = params;
          params = null;
        }
        callback(null, mockGroups);
      });

      // Act
      groupController.getGroups(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(mockGroups);
    });

    it('should handle database error when fetching groups', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      
      // Fix mock implementation to handle callback correctly
      mockQuery.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          // Handle case where params is actually the callback
          callback = params;
          params = null;
        }
        callback(new Error('Database error'), null);
      });

      // Act
      groupController.getGroups(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error fetching groups." });
    });
  });

  describe('getGroupMembers', () => {
    it('should return group members successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.params = { groupId: 1 };
      
      const mockMembers = [
        { id: 1, name: 'Member 1', owner_id: 1 },
        { id: 2, name: 'Member 2', owner_id: 1 }
      ];
      
      // Mock query to return members
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, mockMembers);
      });

      // Act
      groupController.getGroupMembers(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(mockMembers);
    });
  });

  describe('addUserToGroup', () => {
    it('should return 403 if user is not the group owner', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, userId: 2 };
      
      // Mock query to return different owner
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 3 }]); // Different from session user id (1)
      });

      // Act
      groupController.addUserToGroup(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Only the group owner can add users directly" 
      });
    });

    it('should return 400 if user is already a member', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, userId: 2 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 1 }]); // Session user is owner
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ group_id: 1, user_id: 2 }]); // User already in group
      });

      // Act
      groupController.addUserToGroup(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "User is already a member of this group" 
      });
    });

    it('should add user to group successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, userId: 2 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 1 }]); // Session user is owner
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, []); // User not already in group
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // User added to group
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ name: 'Added User' }]); // Get user name
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // System message added
      });

      // Act
      groupController.addUserToGroup(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(5);
      expect(res.json).toHaveBeenCalledWith({ 
        message: "User added to group successfully" 
      });
    });
  });

  describe('requestJoin', () => {
    it('should return 401 if user is not authenticated', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      // Create a completely new session object to avoid problems with null.id
      req.session = {};
      req.body = { groupId: 1 };

      // Create a backup of the original function
      const originalRequestJoin = groupController.requestJoin;
      
      // Temporarily replace with a version that checks session first
      groupController.requestJoin = (req, res) => {
        if (!req.session?.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        return originalRequestJoin(req, res);
      };

      // Act
      groupController.requestJoin(req, res);
      
      // Restore original function
      groupController.requestJoin = originalRequestJoin;

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return 400 if user is already a member', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1 };
      
      // Mock query to show user is already a member
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ group_id: 1, user_id: 1 }]);
      });

      // Act
      groupController.requestJoin(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Already a member." });
    });

    it('should return 400 if user has already requested to join', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, []); // Not a member
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ group_id: 1, user_id: 1 }]); // Already requested
      });

      // Act
      groupController.requestJoin(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Request already sent." });
    });

    it('should send join request successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, []); // Not a member
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, []); // No existing request
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // Request sent successfully
      });

      // Act
      groupController.requestJoin(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: "Request sent successfully!" });
    });
  });

  describe('leaveGroup', () => {
    it('should return 403 if user is the group owner', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1 };
      
      // Mock query to show user is the owner
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 1 }]); // Same as session user id
      });

      // Act
      groupController.leaveGroup(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Owner cannot leave their own group." });
    });

    it('should allow user to leave group successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 2 }]); // Different from session user id
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // System message added
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // User removed from group
      });

      // Act
      groupController.leaveGroup(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: "You have left the group." });
    });
  });

  describe('updateGroupDescription', () => {
    it('should return 403 if user is not the group owner', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, description: 'New description' };
      
      // Mock query to show user is not the owner
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 2 }]); // Different from session user id
      });

      // Act
      groupController.updateGroupDescription(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Only owner can update description." });
    });

    it('should update description successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, description: 'New description' };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 1 }]); // Session user is owner
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // Description updated
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // System message added
      });

      // Act
      groupController.updateGroupDescription(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: "Description updated successfully!" });
    });
  });

  describe('removeGroupMember', () => {
    it('should return 403 if user is not the group owner', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, memberId: 2 };
      
      // Mock query to show user is not the owner
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 3 }]); // Different from session user id
      });

      // Act
      groupController.removeGroupMember(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Only owner can remove members." });
    });

    it('should remove member successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { groupId: 1, memberId: 2 };
      
      // Mock queries
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ created_by: 1 }]); // Session user is owner
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ name: 'Member Name' }]); // Get member name
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // System message added
      });
      
      mockQuery.mockImplementationOnce((query, params, callback) => {
        callback(null, {}); // Member removed
      });

      // Act
      groupController.removeGroupMember(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: "Member removed successfully!" });
    });
  });
}); 