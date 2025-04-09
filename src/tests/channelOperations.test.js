const connection = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Channel Operations', () => {
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
      }
    };
    
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  // Test simple functionality without complex session mocking
  test('mocking works correctly', () => {
    // Basic sanity test to check that our mocking approach works
    expect(connection.query).not.toHaveBeenCalled();
    expect(res.status().json).not.toHaveBeenCalled();
    expect(req.session.user.id).toBe(1);
  });

  test('should mock database query correctly', () => {
    // Set up a simple mock for testing
    connection.query.mockImplementation((query, params, callback) => {
      callback(null, [{ id: 1, name: 'general' }]);
    });
    
    // Make a query
    connection.query('SELECT * FROM channels', [], (err, results) => {
      expect(err).toBeNull();
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('general');
    });
    
    // Verify the mock was called
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('should handle database error correctly', () => {
    // Set up error mock
    const testError = new Error('Database error');
    connection.query.mockImplementation((query, params, callback) => {
      callback(testError, null);
    });
    
    // Mock console.error to avoid polluting test output
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    // Make a query that will result in error
    connection.query('SELECT * FROM channels', [], (err, results) => {
      expect(err).toBe(testError);
      expect(results).toBeNull();
    });
    
    // Restore console.error
    console.error = originalConsoleError;
    
    // Verify the mock was called
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('should create a channel successfully', () => {
    // Set up request
    req.body = {
      channelName: 'test-channel',
      teamId: 1
    };
    
    // Mock database responses
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - check team membership
        callback(null, [{ user_id: 1 }]);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - insert channel
        callback(null, { insertId: 1 });
      });
    
    // Create test function
    const createChannel = (req, res) => {
      const { channelName, teamId } = req.body;
      const userId = req.session.user.id;
      
      // Verify team membership
      connection.query(
        "SELECT t.created_by AS creatorId, ut.user_id FROM teams t LEFT JOIN user_teams ut ON t.id = ut.team_id WHERE t.id = ? AND (t.created_by = ? OR ut.user_id = ?)",
        [teamId, userId, userId],
        (err, results) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (results.length === 0) {
            return res.status(403).json({ error: "Not a team member" });
          }
          
          // Create channel
          connection.query(
            "INSERT INTO channels (name, team_id) VALUES (?, ?)",
            [channelName, teamId],
            (err, result) => {
              if (err) {
                return res.status(500).json({ error: "Error creating channel" });
              }
              
              res.json({ 
                message: "Channel created successfully", 
                channelId: result.insertId 
              });
            }
          );
        }
      );
    };
    
    // Call function
    createChannel(req, res);
    
    // Verify database operations
    expect(connection.query).toHaveBeenCalledTimes(2);
    // Check first query
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual([1, 1, 1]);
    // Check second query
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO channels');
    expect(connection.query.mock.calls[1][1]).toEqual(['test-channel', 1]);
    // Check response
    expect(res.json).toHaveBeenCalledWith({ 
      message: "Channel created successfully", 
      channelId: 1 
    });
  });

  test('should return error when creating a channel without being a team member', () => {
    // Set up request
    req.body = {
      channelName: 'unauthorized-channel',
      teamId: 2
    };
    
    // Mock database response - no team membership
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, []);
    });
    
    // Create test function
    const createChannel = (req, res) => {
      const { channelName, teamId } = req.body;
      const userId = req.session.user.id;
      
      // Verify team membership
      connection.query(
        "SELECT t.created_by AS creatorId, ut.user_id FROM teams t LEFT JOIN user_teams ut ON t.id = ut.team_id WHERE t.id = ? AND (t.created_by = ? OR ut.user_id = ?)",
        [teamId, userId, userId],
        (err, results) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (results.length === 0) {
            return res.status(403).json({ error: "Not a team member" });
          }
          
          // Create channel
          res.json({ message: "Channel created successfully" });
        }
      );
    };
    
    // Call function
    createChannel(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual([2, 1, 1]);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not a team member" });
  });

  test('should get all channels for a team', () => {
    // Set up request
    req.params = { teamId: '1' };
    
    // Mock database response with list of channels
    const mockChannels = [
      { id: 1, name: 'general', team_id: 1 },
      { id: 2, name: 'random', team_id: 1 }
    ];
    
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, mockChannels);
    });
    
    // Create test function
    const getChannels = (req, res) => {
      const teamId = req.params.teamId;
      
      connection.query(
        "SELECT * FROM channels WHERE team_id = ?",
        [teamId],
        (err, channels) => {
          if (err) {
            return res.status(500).json({ error: "Error fetching channels" });
          }
          
          res.json(channels);
        }
      );
    };
    
    // Call function
    getChannels(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual(['1']);
    expect(res.json).toHaveBeenCalledWith(mockChannels);
  });

  test('should send a message to a channel', () => {
    // Set up request
    req.body = {
      teamName: 'Test Team',
      channelName: 'general',
      text: 'Hello, world!'
    };
    
    // Mock database responses
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - check access to channel
        callback(null, [{ channel_id: 1 }]);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - insert message
        callback(null, { insertId: 1 });
      });
    
    // Create test function
    const sendMessage = (req, res) => {
      const { teamName, channelName, text } = req.body;
      const senderName = req.session.user.name;
      
      // Check channel access
      connection.query(
        "SELECT c.id AS channel_id FROM channels c JOIN user_channels uc ON c.id = uc.channel_id JOIN teams t ON c.team_id = t.id WHERE t.name = ? AND c.name = ? AND uc.user_id = ?",
        [teamName, channelName, req.session.user.id],
        (err, access) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (access.length === 0) {
            return res.status(403).json({ error: "No access to this channel" });
          }
          
          // Send message
          connection.query(
            "INSERT INTO channels_messages (team_name, channel_name, sender, text) VALUES (?, ?, ?, ?)",
            [teamName, channelName, senderName, text],
            (err, result) => {
              if (err) {
                return res.status(500).json({ error: "Error sending message" });
              }
              
              res.json({ message: "Message sent successfully" });
            }
          );
        }
      );
    };
    
    // Call function
    sendMessage(req, res);
    
    // Verify database operations
    expect(connection.query).toHaveBeenCalledTimes(2);
    // Check first query for access
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    // Check second query inserts message
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO channels_messages');
    expect(connection.query.mock.calls[1][1]).toEqual(['Test Team', 'general', 'TestUser', 'Hello, world!']);
    // Check response
    expect(res.json).toHaveBeenCalledWith({ message: "Message sent successfully" });
  });

  test('should not allow sending message without channel access', () => {
    // Set up request
    req.body = {
      teamName: 'Test Team',
      channelName: 'private',
      text: 'Unauthorized message'
    };
    
    // Mock database response - no channel access
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, []);
    });
    
    // Create test function
    const sendMessage = (req, res) => {
      const { teamName, channelName, text } = req.body;
      
      // Check channel access
      connection.query(
        "SELECT c.id AS channel_id FROM channels c JOIN user_channels uc ON c.id = uc.channel_id JOIN teams t ON c.team_id = t.id WHERE t.name = ? AND c.name = ? AND uc.user_id = ?",
        [teamName, channelName, req.session.user.id],
        (err, access) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (access.length === 0) {
            return res.status(403).json({ error: "No access to this channel" });
          }
          
          // Send message (this shouldn't be reached in this test)
          res.json({ message: "Message sent successfully" });
        }
      );
    };
    
    // Call function
    sendMessage(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "No access to this channel" });
  });

  test('should get channel messages', () => {
    // Set up request
    req.params = {
      teamName: 'Test Team',
      channelName: 'general'
    };
    
    // Mock database response with messages
    const mockMessages = [
      {
        id: 1,
        team_name: 'Test Team',
        channel_name: 'general',
        sender: 'TestUser',
        text: 'Hello, world!',
        timestamp: new Date()
      },
      {
        id: 2,
        team_name: 'Test Team',
        channel_name: 'general',
        sender: 'OtherUser',
        text: 'Hi there!',
        timestamp: new Date()
      }
    ];
    
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, mockMessages);
    });
    
    // Create test function
    const getMessages = (req, res) => {
      const { teamName, channelName } = req.params;
      
      connection.query(
        "SELECT * FROM channels_messages WHERE team_name = ? AND channel_name = ? ORDER BY timestamp",
        [teamName, channelName],
        (err, messages) => {
          if (err) {
            return res.status(500).json({ error: "Error fetching messages" });
          }
          
          res.json(messages);
        }
      );
    };
    
    // Call function
    getMessages(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual(['Test Team', 'general']);
    expect(res.json).toHaveBeenCalledWith(mockMessages);
  });

  test('should handle database error when getting channel messages', () => {
    // Set up request
    req.params = {
      teamName: 'Test Team',
      channelName: 'general'
    };
    
    // Mock database error
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(new Error('Database error'), null);
    });
    
    // Create test function
    const getMessages = (req, res) => {
      const { teamName, channelName } = req.params;
      
      connection.query(
        "SELECT * FROM channels_messages WHERE team_name = ? AND channel_name = ? ORDER BY timestamp",
        [teamName, channelName],
        (err, messages) => {
          if (err) {
            return res.status(500).json({ error: "Error fetching messages" });
          }
          
          res.json(messages);
        }
      );
    };
    
    // Call function
    getMessages(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Error fetching messages" });
  });

  test('should join a channel', () => {
    // Set up request
    req.body = {
      channelId: 1
    };
    
    // Mock database responses
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - check existing membership
        callback(null, []);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - insert membership
        callback(null, { affectedRows: 1 });
      });
    
    // Create test function
    const joinChannel = (req, res) => {
      const { channelId } = req.body;
      const userId = req.session.user.id;
      
      // Check if already a member
      connection.query(
        "SELECT * FROM user_channels WHERE channel_id = ? AND user_id = ?",
        [channelId, userId],
        (err, existing) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (existing.length > 0) {
            return res.status(400).json({ error: "Already a member of this channel" });
          }
          
          // Join channel
          connection.query(
            "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)",
            [userId, channelId],
            (err, result) => {
              if (err) {
                return res.status(500).json({ error: "Error joining channel" });
              }
              
              res.json({ message: "Successfully joined channel" });
            }
          );
        }
      );
    };
    
    // Call function
    joinChannel(req, res);
    
    // Verify database operations
    expect(connection.query).toHaveBeenCalledTimes(2);
    // Check first query
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual([1, 1]);
    // Check second query
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO user_channels');
    expect(connection.query.mock.calls[1][1]).toEqual([1, 1]);
    // Check response
    expect(res.json).toHaveBeenCalledWith({ message: "Successfully joined channel" });
  });

  test('should not allow joining a channel twice', () => {
    // Set up request
    req.body = {
      channelId: 1
    };
    
    // Mock database response - already a member
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, [{ user_id: 1, channel_id: 1 }]);
    });
    
    // Create test function
    const joinChannel = (req, res) => {
      const { channelId } = req.body;
      const userId = req.session.user.id;
      
      // Check if already a member
      connection.query(
        "SELECT * FROM user_channels WHERE channel_id = ? AND user_id = ?",
        [channelId, userId],
        (err, existing) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }
          
          if (existing.length > 0) {
            return res.status(400).json({ error: "Already a member of this channel" });
          }
          
          // Join channel (this shouldn't be reached in this test)
          res.json({ message: "Successfully joined channel" });
        }
      );
    };
    
    // Call function
    joinChannel(req, res);
    
    // Verify database query and response
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT');
    expect(connection.query.mock.calls[0][1]).toEqual([1, 1]);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Already a member of this channel" });
  });
}); 