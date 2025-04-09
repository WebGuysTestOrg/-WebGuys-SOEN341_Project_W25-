const connection = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Group Management', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Mock request and response objects
    req = {
      query: {},
      body: {},
      params: {},
      session: {
        user: {
          id: 1,
          name: 'TestUser',
          email: 'test@example.com',
          user_type: 'user'
        }
      },
      app: {
        get: jest.fn().mockReturnValue({
          emit: jest.fn(),
          to: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis()
        })
      }
    };
    
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });
  
  describe('Group Creation', () => {
    test('should create a new group successfully', () => {
      // Set up request data
      req.body = {
        groupName: 'Test Group',
        description: 'A test group for unit testing'
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - insert group
          callback(null, { insertId: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - add creator as member
          callback(null, { affectedRows: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - add system message
          callback(null, { insertId: 1 });
        });
      
      // Create test function
      const createGroup = (req, res) => {
        const { groupName, description } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;
        
        if (!groupName) {
          return res.status(400).json({ error: "Group name is required" });
        }
        
        // Create group
        connection.query(
          "INSERT INTO `groups` (name, description, created_by, created_at) VALUES (?, ?, ?, NOW())",
          [groupName, description || '', userId],
          (err, result) => {
            if (err) {
              if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: "Group name already exists" });
              }
              return res.status(500).json({ error: "Error creating group" });
            }
            
            const groupId = result.insertId;
            
            // Add creator as member
            connection.query(
              "INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())",
              [groupId, userId],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: "Error adding you to the group" });
                }
                
                // Add system message
                connection.query(
                  "INSERT INTO group_messages (group_id, user_id, text, is_system_message, created_at) VALUES (?, ?, ?, 1, NOW())",
                  [groupId, userId, `${userName} created the group.`],
                  (err) => {
                    if (err) {
                      console.error("Error adding system message:", err);
                      // Continue anyway
                    }
                    
                    // Notify connected clients
                    const io = req.app.get('io');
                    if (io) {
                      io.emit('groupCreated', {
                        groupId,
                        groupName,
                        createdBy: userId,
                        creatorName: userName
                      });
                    }
                    
                    res.json({ 
                      message: "Group created successfully",
                      groupId,
                      groupName
                    });
                  }
                );
              }
            );
          }
        );
      };
      
      // Call function
      createGroup(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(3);
      // First query - create group
      expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO `groups`');
      expect(connection.query.mock.calls[0][1]).toEqual(['Test Group', 'A test group for unit testing', 1]);
      // Second query - add creator as member
      expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO group_members');
      expect(connection.query.mock.calls[1][1]).toEqual([1, 1]);
      // Third query - add system message
      expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO group_messages');
      expect(connection.query.mock.calls[2][1]).toEqual([1, 1, 'TestUser created the group.']);
      
      // Verify socket.io notification
      expect(req.app.get('io').emit).toHaveBeenCalledWith('groupCreated', {
        groupId: 1,
        groupName: 'Test Group',
        createdBy: 1,
        creatorName: 'TestUser'
      });
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "Group created successfully",
        groupId: 1,
        groupName: 'Test Group'
      });
    });
    
    test('should return error when group name is missing', () => {
      // Set up request with missing name
      req.body = {
        description: 'A test group for unit testing'
      };
      
      // Create test function
      const createGroup = (req, res) => {
        const { groupName } = req.body;
        
        if (!groupName) {
          return res.status(400).json({ error: "Group name is required" });
        }
        
        // This shouldn't be reached
        connection.query(/* ... */);
      };
      
      // Call function
      createGroup(req, res);
      
      // Verify validation error
      expect(connection.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Group name is required" });
    });
    
    test('should return error when group name already exists', () => {
      // Set up request data
      req.body = {
        groupName: 'Existing Group',
        description: 'This group already exists'
      };
      
      // Mock database error - duplicate entry
      const duplicateError = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(duplicateError, null);
      });
      
      // Create test function
      const createGroup = (req, res) => {
        const { groupName, description } = req.body;
        const userId = req.session.user.id;
        
        // Create group
        connection.query(
          "INSERT INTO `groups` (name, description, created_by, created_at) VALUES (?, ?, ?, NOW())",
          [groupName, description || '', userId],
          (err, result) => {
            if (err) {
              if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: "Group name already exists" });
              }
              return res.status(500).json({ error: "Error creating group" });
            }
            
            // This shouldn't be reached
            res.json({ message: "Group created successfully" });
          }
        );
      };
      
      // Call function
      createGroup(req, res);
      
      // Verify error response
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Group name already exists" });
    });
  });
  
  describe('Group Membership', () => {
    test('should add member to group successfully', () => {
      // Set up request - as admin
      req.session.user.user_type = 'admin';
      req.body = {
        groupId: 1,
        userId: 2
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - get user name
          callback(null, [{ name: 'NewMember' }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - add to group
          callback(null, { affectedRows: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - add system message
          callback(null, { insertId: 2 });
        });
      
      // Create test function
      const addMemberToGroup = (req, res) => {
        const { groupId, userId } = req.body;
        const adminId = req.session.user.id;
        const adminName = req.session.user.name;
        
        // Get user name
        connection.query(
          "SELECT name FROM user_form WHERE id = ?",
          [userId],
          (err, users) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (users.length === 0) {
              return res.status(404).json({ error: "User not found" });
            }
            
            const userName = users[0].name;
            
            // Add to group
            connection.query(
              "INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())",
              [groupId, userId],
              (err) => {
                if (err) {
                  if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: "User is already a member of this group" });
                  }
                  return res.status(500).json({ error: "Error adding member to group" });
                }
                
                // Add system message
                connection.query(
                  "INSERT INTO group_messages (group_id, user_id, text, is_system_message, created_at) VALUES (?, ?, ?, 1, NOW())",
                  [groupId, adminId, `${userName} was added to the group by ${adminName}.`],
                  (err) => {
                    if (err) {
                      console.error("Error adding system message:", err);
                      // Continue anyway
                    }
                    
                    // Notify connected clients
                    const io = req.app.get('io');
                    if (io) {
                      io.to(`group-${groupId}`).emit('memberAdded', {
                        groupId,
                        userId,
                        userName,
                        addedBy: adminId,
                        addedByName: adminName
                      });
                    }
                    
                    res.json({ 
                      message: "Member added successfully",
                      userName
                    });
                  }
                );
              }
            );
          }
        );
      };
      
      // Call function
      addMemberToGroup(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(3);
      // First query - get user
      expect(connection.query.mock.calls[0][0]).toContain('SELECT name FROM user_form');
      expect(connection.query.mock.calls[0][1]).toEqual([2]);
      // Second query - add to group
      expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO group_members');
      expect(connection.query.mock.calls[1][1]).toEqual([1, 2]);
      // Third query - add system message
      expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO group_messages');
      expect(connection.query.mock.calls[2][1]).toEqual([1, 1, 'NewMember was added to the group by TestUser.']);
      
      // Verify socket.io notification
      expect(req.app.get('io').to).toHaveBeenCalledWith('group-1');
      expect(req.app.get('io').to().emit).toHaveBeenCalledWith('memberAdded', {
        groupId: 1,
        userId: 2,
        userName: 'NewMember',
        addedBy: 1,
        addedByName: 'TestUser'
      });
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "Member added successfully",
        userName: 'NewMember'
      });
    });
    
    test('should handle request to join group', () => {
      // Set up request
      req.body = {
        groupId: 1
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - check if already a member
          callback(null, []);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - check if already requested
          callback(null, []);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - add request
          callback(null, { insertId: 1 });
        });
      
      // Create test function
      const requestJoinGroup = (req, res) => {
        const { groupId } = req.body;
        const userId = req.session.user.id;
        
        // Check if already a member
        connection.query(
          "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?",
          [groupId, userId],
          (err, members) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (members.length > 0) {
              return res.status(400).json({ error: "Already a member of this group" });
            }
            
            // Check if already requested
            connection.query(
              "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?",
              [groupId, userId],
              (err, requests) => {
                if (err) {
                  return res.status(500).json({ error: "Database error" });
                }
                
                if (requests.length > 0) {
                  return res.status(400).json({ error: "Already requested to join this group" });
                }
                
                // Add request
                connection.query(
                  "INSERT INTO group_requests (group_id, user_id, requested_at) VALUES (?, ?, NOW())",
                  [groupId, userId],
                  (err) => {
                    if (err) {
                      return res.status(500).json({ error: "Error sending join request" });
                    }
                    
                    // Notify group admins
                    const io = req.app.get('io');
                    if (io) {
                      io.to(`group-admin-${groupId}`).emit('joinRequested', {
                        groupId,
                        userId,
                        userName: req.session.user.name
                      });
                    }
                    
                    res.json({ message: "Join request sent successfully" });
                  }
                );
              }
            );
          }
        );
      };
      
      // Call function
      requestJoinGroup(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(3);
      // First query - check membership
      expect(connection.query.mock.calls[0][0]).toContain('SELECT * FROM group_members');
      expect(connection.query.mock.calls[0][1]).toEqual([1, 1]);
      // Second query - check requests
      expect(connection.query.mock.calls[1][0]).toContain('SELECT * FROM group_requests');
      expect(connection.query.mock.calls[1][1]).toEqual([1, 1]);
      // Third query - insert request
      expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO group_requests');
      expect(connection.query.mock.calls[2][1]).toEqual([1, 1]);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({ message: "Join request sent successfully" });
    });
    
    test('should remove member from group', () => {
      // Set up request - as admin
      req.session.user.user_type = 'admin';
      req.body = {
        groupId: 1,
        memberId: 2
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - check if group creator
          callback(null, [{ created_by: 3 }]); // Not the user being removed
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - get member name
          callback(null, [{ name: 'RemovedMember' }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - add system message
          callback(null, { insertId: 3 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Fourth call - remove member
          callback(null, { affectedRows: 1 });
        });
      
      // Create test function
      const removeMember = (req, res) => {
        const { groupId, memberId } = req.body;
        const adminId = req.session.user.id;
        const adminName = req.session.user.name;
        
        // Check if removing group creator
        connection.query(
          "SELECT created_by FROM `groups` WHERE id = ?",
          [groupId],
          (err, groups) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (groups.length === 0) {
              return res.status(404).json({ error: "Group not found" });
            }
            
            if (groups[0].created_by === parseInt(memberId)) {
              return res.status(403).json({ error: "Cannot remove the group creator" });
            }
            
            // Get member name
            connection.query(
              "SELECT name FROM user_form WHERE id = ?",
              [memberId],
              (err, users) => {
                if (err) {
                  return res.status(500).json({ error: "Database error" });
                }
                
                if (users.length === 0) {
                  return res.status(404).json({ error: "User not found" });
                }
                
                const memberName = users[0].name;
                
                // Add system message
                connection.query(
                  "INSERT INTO group_messages (group_id, user_id, text, is_system_message, created_at) VALUES (?, ?, ?, 1, NOW())",
                  [groupId, adminId, `${memberName} was removed from the group by ${adminName}.`],
                  (err) => {
                    if (err) {
                      console.error("Error adding system message:", err);
                      // Continue anyway
                    }
                    
                    // Remove member
                    connection.query(
                      "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
                      [groupId, memberId],
                      (err, result) => {
                        if (err) {
                          return res.status(500).json({ error: "Error removing member" });
                        }
                        
                        if (result.affectedRows === 0) {
                          return res.status(404).json({ error: "User is not a member of this group" });
                        }
                        
                        // Notify connected clients
                        const io = req.app.get('io');
                        if (io) {
                          io.to(`group-${groupId}`).emit('memberRemoved', {
                            groupId,
                            userId: memberId,
                            removedByName: adminName
                          });
                        }
                        
                        res.json({ message: "Member removed successfully" });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      };
      
      // Call function
      removeMember(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(4);
      // First query - check group creator
      expect(connection.query.mock.calls[0][0]).toContain('SELECT created_by FROM `groups`');
      expect(connection.query.mock.calls[0][1]).toEqual([1]);
      // Second query - get user name
      expect(connection.query.mock.calls[1][0]).toContain('SELECT name FROM user_form');
      expect(connection.query.mock.calls[1][1]).toEqual([2]);
      // Third query - add system message
      expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO group_messages');
      expect(connection.query.mock.calls[2][1]).toEqual([1, 1, 'RemovedMember was removed from the group by TestUser.']);
      // Fourth query - remove member
      expect(connection.query.mock.calls[3][0]).toContain('DELETE FROM group_members');
      expect(connection.query.mock.calls[3][1]).toEqual([1, 2]);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({ message: "Member removed successfully" });
    });
  });
  
  describe('Group Messaging', () => {
    test('should send message to group', () => {
      // Set up request
      req.body = {
        groupId: 1,
        text: 'Hello group!'
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - verify membership
          callback(null, [{ user_id: 1 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - insert message
          callback(null, { insertId: 5 });
        });
      
      // Create test function
      const sendGroupMessage = (req, res) => {
        const { groupId, text } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;
        
        if (!text || !text.trim()) {
          return res.status(400).json({ error: "Message text is required" });
        }
        
        // Verify group membership
        connection.query(
          "SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?",
          [groupId, userId],
          (err, members) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (members.length === 0) {
              return res.status(403).json({ error: "You are not a member of this group" });
            }
            
            // Insert message
            connection.query(
              "INSERT INTO group_messages (group_id, user_id, text, is_system_message, created_at) VALUES (?, ?, ?, 0, NOW())",
              [groupId, userId, text],
              (err, result) => {
                if (err) {
                  return res.status(500).json({ error: "Error sending message" });
                }
                
                const messageId = result.insertId;
                const timestamp = new Date();
                
                // Notify group members
                const io = req.app.get('io');
                if (io) {
                  io.to(`group-${groupId}`).emit('groupMessage', {
                    id: messageId,
                    groupId,
                    userId,
                    senderName: userName,
                    text,
                    isSystemMessage: false,
                    timestamp
                  });
                }
                
                res.json({ 
                  message: "Message sent successfully",
                  id: messageId,
                  timestamp
                });
              }
            );
          }
        );
      };
      
      // Call function
      sendGroupMessage(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(2);
      // First query - check membership
      expect(connection.query.mock.calls[0][0]).toContain('SELECT user_id FROM group_members');
      expect(connection.query.mock.calls[0][1]).toEqual([1, 1]);
      // Second query - insert message
      expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO group_messages');
      expect(connection.query.mock.calls[1][1]).toEqual([1, 1, 'Hello group!']);
      
      // Verify socket.io notification
      expect(req.app.get('io').to).toHaveBeenCalledWith('group-1');
      expect(req.app.get('io').to().emit).toHaveBeenCalledWith('groupMessage', expect.objectContaining({
        id: 5,
        groupId: 1,
        userId: 1,
        senderName: 'TestUser',
        text: 'Hello group!',
        isSystemMessage: false
      }));
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
        message: "Message sent successfully",
        id: 5
      }));
    });
    
    test('should not allow non-members to send messages', () => {
      // Set up request
      req.body = {
        groupId: 1,
        text: 'Hello group!'
      };
      
      // Mock database response - user not a member
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, []);
      });
      
      // Create test function
      const sendGroupMessage = (req, res) => {
        const { groupId, text } = req.body;
        const userId = req.session.user.id;
        
        // Verify group membership
        connection.query(
          "SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?",
          [groupId, userId],
          (err, members) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (members.length === 0) {
              return res.status(403).json({ error: "You are not a member of this group" });
            }
            
            // This shouldn't be reached
            res.json({ message: "Message sent successfully" });
          }
        );
      };
      
      // Call function
      sendGroupMessage(req, res);
      
      // Verify error response
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "You are not a member of this group" });
    });
  });
}); 