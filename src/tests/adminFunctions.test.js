const connection = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Admin Functions', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Mock request and response objects with admin user
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
  
  describe('User Management', () => {
    test('should get all users', () => {
      // Mock database response with list of users
      const mockUsers = [
        { id: 1, name: 'AdminUser', email: 'admin@example.com', user_type: 'admin', status: 'active' },
        { id: 2, name: 'RegularUser1', email: 'user1@example.com', user_type: 'user', status: 'active' },
        { id: 3, name: 'RegularUser2', email: 'user2@example.com', user_type: 'user', status: 'inactive' }
      ];
      
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, mockUsers);
      });
      
      // Create test function
      const getAllUsers = (req, res) => {
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        // Get all users
        connection.query(
          "SELECT id, name, email, user_type, status, created_at FROM user_form ORDER BY id",
          [],
          (err, users) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching users" });
            }
            
            res.json(users);
          }
        );
      };
      
      // Call function
      getAllUsers(req, res);
      
      // Verify database query and response
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(connection.query.mock.calls[0][0]).toContain('SELECT id, name, email, user_type, status');
      expect(res.json).toHaveBeenCalledWith(mockUsers);
    });
    
    test('should change user status', () => {
      // Set up request
      req.body = {
        userId: 2,
        status: 'inactive'
      };
      
      // Mock database response
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // Update user status
          callback(null, { affectedRows: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Get updated user
          callback(null, [{ 
            id: 2, 
            name: 'RegularUser', 
            email: 'user@example.com', 
            user_type: 'user', 
            status: 'inactive' 
          }]);
        });
      
      // Create test function
      const updateUserStatus = (req, res) => {
        const { userId, status } = req.body;
        
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        // Validate input
        if (!userId || !status) {
          return res.status(400).json({ error: "User ID and status are required" });
        }
        
        if (!['active', 'inactive', 'suspended'].includes(status)) {
          return res.status(400).json({ error: "Invalid status value" });
        }
        
        // Update status
        connection.query(
          "UPDATE user_form SET status = ? WHERE id = ?",
          [status, userId],
          (err, result) => {
            if (err) {
              return res.status(500).json({ error: "Error updating user status" });
            }
            
            if (result.affectedRows === 0) {
              return res.status(404).json({ error: "User not found" });
            }
            
            // Get updated user
            connection.query(
              "SELECT id, name, email, user_type, status FROM user_form WHERE id = ?",
              [userId],
              (err, users) => {
                if (err) {
                  return res.status(500).json({ error: "Error fetching updated user" });
                }
                
                // Notify connected clients
                const io = req.app.get('io');
                if (io) {
                  io.emit('userStatusChanged', {
                    userId,
                    status,
                    updatedBy: req.session.user.id
                  });
                }
                
                res.json({
                  message: "User status updated successfully",
                  user: users[0]
                });
              }
            );
          }
        );
      };
      
      // Call function
      updateUserStatus(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(2);
      // First query - update status
      expect(connection.query.mock.calls[0][0]).toContain('UPDATE user_form SET status = ?');
      expect(connection.query.mock.calls[0][1]).toEqual(['inactive', 2]);
      // Second query - get updated user
      expect(connection.query.mock.calls[1][0]).toContain('SELECT id, name, email, user_type, status');
      expect(connection.query.mock.calls[1][1]).toEqual([2]);
      
      // Verify socket.io notification
      expect(req.app.get('io').emit).toHaveBeenCalledWith('userStatusChanged', {
        userId: 2,
        status: 'inactive',
        updatedBy: 1
      });
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "User status updated successfully",
        user: expect.objectContaining({
          id: 2,
          status: 'inactive'
        })
      });
    });
    
    test('should not allow non-admin users to manage users', () => {
      // Change to regular user
      req.session.user.user_type = 'user';
      req.body = {
        userId: 2,
        status: 'inactive'
      };
      
      // Create test function
      const updateUserStatus = (req, res) => {
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        // This shouldn't be reached
        connection.query(/* ... */);
      };
      
      // Call function
      updateUserStatus(req, res);
      
      // Verify access denied
      expect(connection.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Admin access required" });
    });
  });
  
  describe('Content Moderation', () => {
    test('should remove inappropriate message', () => {
      // Set up request
      req.body = {
        messageId: 123,
        action: 'remove',
        reason: 'Inappropriate content'
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - get message details
          callback(null, [{
            id: 123,
            team_name: 'Team1',
            channel_name: 'general',
            sender: 'UserX',
            sender_id: 5,
            text: 'Bad message content'
          }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - update message
          callback(null, { affectedRows: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - add moderation log
          callback(null, { insertId: 1 });
        });
      
      // Create test function
      const moderateMessage = (req, res) => {
        const { messageId, action, reason } = req.body;
        const adminId = req.session.user.id;
        const adminName = req.session.user.name;
        
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        // Get message details
        connection.query(
          "SELECT id, team_name, channel_name, sender, user_id AS sender_id, text FROM channels_messages WHERE id = ?",
          [messageId],
          (err, messages) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }
            
            if (messages.length === 0) {
              return res.status(404).json({ error: "Message not found" });
            }
            
            const message = messages[0];
            
            if (action === 'remove') {
              // Update message text
              connection.query(
                "UPDATE channels_messages SET text = 'Message removed by moderator', moderated = 1 WHERE id = ?",
                [messageId],
                (err, result) => {
                  if (err) {
                    return res.status(500).json({ error: "Error removing message" });
                  }
                  
                  // Add to moderation log
                  connection.query(
                    "INSERT INTO moderation_log (moderator_id, action, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
                    [adminId, 'remove_message', 'message', messageId, reason],
                    (err) => {
                      if (err) {
                        console.error("Error adding to moderation log:", err);
                        // Continue anyway
                      }
                      
                      // Notify connected clients
                      const io = req.app.get('io');
                      if (io) {
                        io.to(`channel-${message.team_name}-${message.channel_name}`).emit('messageModerated', {
                          messageId,
                          action,
                          moderatorId: adminId,
                          moderatorName: adminName
                        });
                      }
                      
                      res.json({ 
                        message: "Message moderated successfully", 
                        action 
                      });
                    }
                  );
                }
              );
            } else {
              return res.status(400).json({ error: "Invalid moderation action" });
            }
          }
        );
      };
      
      // Call function
      moderateMessage(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(3);
      // First query - get message
      expect(connection.query.mock.calls[0][0]).toContain('SELECT id, team_name, channel_name');
      expect(connection.query.mock.calls[0][1]).toEqual([123]);
      // Second query - update message
      expect(connection.query.mock.calls[1][0]).toContain('UPDATE channels_messages');
      expect(connection.query.mock.calls[1][1]).toEqual([123]);
      // Third query - add log
      expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO moderation_log');
      
      // Verify socket.io notification
      expect(req.app.get('io').to).toHaveBeenCalledWith('channel-Team1-general');
      expect(req.app.get('io').to().emit).toHaveBeenCalledWith('messageModerated', {
        messageId: 123,
        action: 'remove',
        moderatorId: 1,
        moderatorName: 'AdminUser'
      });
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "Message moderated successfully",
        action: 'remove'
      });
    });
    
    test('should ban user from channel', () => {
      // Set up request
      req.body = {
        userId: 5,
        teamId: 1,
        channelId: 2,
        reason: 'Repeated violations',
        duration: 7 // days
      };
      
      // Mock database responses
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - get user details
          callback(null, [{ name: 'BannedUser' }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - get channel details
          callback(null, [{ name: 'general', team_id: 1 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - get team details
          callback(null, [{ name: 'Team1' }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Fourth call - insert ban
          callback(null, { insertId: 1 });
        })
        .mockImplementationOnce((query, params, callback) => {
          // Fifth call - add system message to channel
          callback(null, { insertId: 2 });
        });
      
      // Create test function
      const banUserFromChannel = (req, res) => {
        const { userId, teamId, channelId, reason, duration } = req.body;
        const adminId = req.session.user.id;
        const adminName = req.session.user.name;
        
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        // Get user details
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
            
            // Get channel details
            connection.query(
              "SELECT name, team_id FROM channels WHERE id = ?",
              [channelId],
              (err, channels) => {
                if (err) {
                  return res.status(500).json({ error: "Database error" });
                }
                
                if (channels.length === 0) {
                  return res.status(404).json({ error: "Channel not found" });
                }
                
                const channelName = channels[0].name;
                
                // Ensure channel belongs to the team
                if (channels[0].team_id !== parseInt(teamId)) {
                  return res.status(400).json({ error: "Channel does not belong to the specified team" });
                }
                
                // Get team name
                connection.query(
                  "SELECT name FROM teams WHERE id = ?",
                  [teamId],
                  (err, teams) => {
                    if (err) {
                      return res.status(500).json({ error: "Database error" });
                    }
                    
                    if (teams.length === 0) {
                      return res.status(404).json({ error: "Team not found" });
                    }
                    
                    const teamName = teams[0].name;
                    
                    // Calculate ban expiration
                    const now = new Date();
                    const expiresAt = new Date();
                    expiresAt.setDate(now.getDate() + (duration || 7));
                    
                    // Insert ban
                    connection.query(
                      "INSERT INTO channel_bans (user_id, team_id, channel_id, moderator_id, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
                      [userId, teamId, channelId, adminId, reason, expiresAt],
                      (err, result) => {
                        if (err) {
                          return res.status(500).json({ error: "Error banning user" });
                        }
                        
                        // Add system message
                        connection.query(
                          "INSERT INTO channels_messages (team_name, channel_name, sender, text, is_system_message) VALUES (?, ?, ?, ?, 1)",
                          [teamName, channelName, 'System', `${userName} has been banned from this channel by ${adminName} for ${duration} days. Reason: ${reason}`],
                          (err) => {
                            if (err) {
                              console.error("Error adding system message:", err);
                              // Continue anyway
                            }
                            
                            // Notify connected clients
                            const io = req.app.get('io');
                            if (io) {
                              // Notify channel members
                              io.to(`channel-${teamName}-${channelName}`).emit('userBanned', {
                                userId,
                                userName,
                                teamId,
                                teamName,
                                channelId,
                                channelName,
                                moderatorId: adminId,
                                moderatorName: adminName,
                                duration,
                                reason
                              });
                              
                              // Notify the banned user
                              io.to(`user-${userId}`).emit('channelBan', {
                                teamId,
                                teamName,
                                channelId,
                                channelName,
                                reason,
                                duration,
                                expiresAt
                              });
                            }
                            
                            res.json({
                              message: "User banned successfully",
                              userId,
                              channelId,
                              expiresAt
                            });
                          }
                        );
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
      banUserFromChannel(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(5);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: "User banned successfully",
        userId: 5,
        channelId: 2
      }));
    });
  });
  
  describe('System Monitoring', () => {
    test('should get system statistics', () => {
      // Mock database responses for various statistics
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          // First call - user count
          callback(null, [{ userCount: 150 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Second call - teams count
          callback(null, [{ teamCount: 25 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Third call - channels count
          callback(null, [{ channelCount: 120 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Fourth call - messages count
          callback(null, [{ messageCount: 3500 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Fifth call - active users today
          callback(null, [{ activeUsers: 75 }]);
        })
        .mockImplementationOnce((query, params, callback) => {
          // Sixth call - moderation actions
          callback(null, [{ moderationCount: 12 }]);
        });
      
      // Create test function
      const getSystemStats = (req, res) => {
        // Verify admin access
        if (req.session.user.user_type !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        
        const stats = {};
        let completedQueries = 0;
        const totalQueries = 6;
        
        // Get total users
        connection.query(
          "SELECT COUNT(*) AS userCount FROM user_form",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.totalUsers = results[0].userCount;
            checkCompletion();
          }
        );
        
        // Get total teams
        connection.query(
          "SELECT COUNT(*) AS teamCount FROM teams",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.totalTeams = results[0].teamCount;
            checkCompletion();
          }
        );
        
        // Get total channels
        connection.query(
          "SELECT COUNT(*) AS channelCount FROM channels",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.totalChannels = results[0].channelCount;
            checkCompletion();
          }
        );
        
        // Get total messages
        connection.query(
          "SELECT COUNT(*) AS messageCount FROM channels_messages",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.totalMessages = results[0].messageCount;
            checkCompletion();
          }
        );
        
        // Get active users today
        connection.query(
          "SELECT COUNT(DISTINCT user_id) AS activeUsers FROM user_activity_log WHERE DATE(login_time) = CURDATE()",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.activeUsersToday = results[0].activeUsers;
            checkCompletion();
          }
        );
        
        // Get moderation actions in the last 7 days
        connection.query(
          "SELECT COUNT(*) AS moderationCount FROM moderation_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
          [],
          (err, results) => {
            if (err) {
              return res.status(500).json({ error: "Error fetching statistics" });
            }
            
            stats.moderationActions7Days = results[0].moderationCount;
            checkCompletion();
          }
        );
        
        // Helper to check if all queries are complete
        function checkCompletion() {
          completedQueries++;
          if (completedQueries === totalQueries) {
            res.json({ 
              message: "System statistics retrieved successfully",
              stats
            });
          }
        }
      };
      
      // Call function
      getSystemStats(req, res);
      
      // Verify database operations
      expect(connection.query).toHaveBeenCalledTimes(6);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({
        message: "System statistics retrieved successfully",
        stats: {
          totalUsers: 150,
          totalTeams: 25,
          totalChannels: 120,
          totalMessages: 3500,
          activeUsersToday: 75,
          moderationActions7Days: 12
        }
      });
    });
  });
}); 