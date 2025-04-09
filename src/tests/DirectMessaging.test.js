const chatController = require('../controllers/chatController');
const connection = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Direct Messaging', () => {
  let req;
  let res;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Mock request and response objects
    req = {
      query: {},
      body: {}
    };
    
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getUserChats', () => {
    test('should get list of chat partners for a user', () => {
      // Set up request query
      req.query = { userId: '1' };
      
      // Mock database response
      const mockChatPartners = [
        { user_id: 2, username: 'User2' },
        { user_id: 3, username: 'User3' }
      ];
      
      // Configure mock to return data
      connection.query.mockImplementation((query, params, callback) => {
        callback(null, mockChatPartners);
      });
      
      // Call the controller function
      chatController.getUserChats(req, res);
      
      // Verify database was queried correctly
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(connection.query.mock.calls[0][1]).toEqual(['1', '1', '1']);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith(mockChatPartners);
    });
    
    test('should return error when userId is missing', () => {
      // Set up request with missing userId
      req.query = {};
      
      // Call the controller function
      chatController.getUserChats(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "User ID is required in query parameters." });
      
      // Verify database was not queried
      expect(connection.query).not.toHaveBeenCalled();
    });
    
    test('should handle database error', () => {
      // Set up request query
      req.query = { userId: '1' };
      
      // Configure mock to return error
      connection.query.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });
      
      // Call the controller function
      chatController.getUserChats(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Database error fetching chats." });
    });
  });

  describe('initChat', () => {
    test('should initialize a new chat between users', () => {
      // Set up request body
      req.body = { userId: '1', recipientId: '2' };
      
      // First call - check existing messages (none found)
      // Second call - insert system message
      connection.query
        .mockImplementationOnce((query, params, callback) => {
          callback(null, []); // No existing messages
        })
        .mockImplementationOnce((query, params, callback) => {
          callback(null, { insertId: 1 }); // Message inserted
        });
      
      // Call the controller function
      chatController.initChat(req, res);
      
      // Verify database queries
      expect(connection.query).toHaveBeenCalledTimes(2);
      
      // Verify first query checks for existing messages
      expect(connection.query.mock.calls[0][1]).toEqual(['1', '2', '2', '1']);
      
      // Verify second query inserts system message
      expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO direct_messages');
      expect(connection.query.mock.calls[1][1]).toEqual(['1', '2', 'Chat initialized']);
      
      // Verify success response
      expect(res.json).toHaveBeenCalledWith({ success: true, message: "Chat initialized successfully" });
    });
    
    test('should not initialize chat if it already exists', () => {
      // Set up request body
      req.body = { userId: '1', recipientId: '2' };
      
      // Configure mock to return existing messages
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ id: 1 }]); // Existing message found
      });
      
      // Call the controller function
      chatController.initChat(req, res);
      
      // Verify only one query was made
      expect(connection.query).toHaveBeenCalledTimes(1);
      
      // Verify response indicates chat already exists
      expect(res.json).toHaveBeenCalledWith({ success: true, message: "Chat already exists" });
    });
    
    test('should return error when required parameters are missing', () => {
      // Set up request with missing recipientId
      req.body = { userId: '1' };
      
      // Call the controller function
      chatController.initChat(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Both user IDs (userId, recipientId) are required in the request body." 
      });
      
      // Verify database was not queried
      expect(connection.query).not.toHaveBeenCalled();
    });
    
    test('should handle database error when checking existing messages', () => {
      // Set up request body
      req.body = { userId: '1', recipientId: '2' };
      
      // Configure mock to return error
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });
      
      // Call the controller function
      chatController.initChat(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Database error checking messages." });
    });
  });

  describe('getDirectMessages', () => {
    test('should get message history between two users', () => {
      // Set up request query
      req.query = { senderId: '1', recipientId: '2' };
      
      // Mock message data
      const mockMessages = [
        { 
          id: 1, 
          text: 'Hello', 
          sender_id: 1, 
          recipient_id: 2, 
          timestamp: '2023-01-01 12:00:00',
          senderName: 'User1' 
        },
        { 
          id: 2, 
          text: 'Hi there', 
          sender_id: 2, 
          recipient_id: 1, 
          timestamp: '2023-01-01 12:01:00',
          senderName: 'User2' 
        }
      ];
      
      // Configure mock to return message data
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, mockMessages);
      });
      
      // Call the controller function
      chatController.getDirectMessages(req, res);
      
      // Verify database query
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(connection.query.mock.calls[0][1]).toEqual(['1', '2', '2', '1']);
      
      // Verify response contains formatted messages
      expect(res.json).toHaveBeenCalled();
      const formattedMessages = res.json.mock.calls[0][0];
      expect(formattedMessages.length).toBe(2);
      expect(formattedMessages[0]).toHaveProperty('id', 1);
      expect(formattedMessages[0]).toHaveProperty('senderId', 1);
      expect(formattedMessages[0]).toHaveProperty('senderName', 'User1');
    });
    
    test('should return error when required parameters are missing', () => {
      // Set up request with missing recipientId
      req.query = { senderId: '1' };
      
      // Call the controller function
      chatController.getDirectMessages(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Both senderId and recipientId are required in query parameters." 
      });
      
      // Verify database was not queried
      expect(connection.query).not.toHaveBeenCalled();
    });
    
    test('should handle database error', () => {
      // Set up request query
      req.query = { senderId: '1', recipientId: '2' };
      
      // Configure mock to return error
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });
      
      // Call the controller function
      chatController.getDirectMessages(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error fetching messages." });
    });
  });

  describe('getUserIdByName', () => {
    test('should get user ID by username', () => {
      // Set up request query
      req.query = { username: 'User1' };
      
      // Configure mock to return user ID
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, [{ id: 1 }]);
      });
      
      // Call the controller function
      chatController.getUserIdByName(req, res);
      
      // Verify database query
      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(connection.query.mock.calls[0][1]).toEqual(['User1']);
      
      // Verify response
      expect(res.json).toHaveBeenCalledWith({ userId: 1 });
    });
    
    test('should return error when username is missing', () => {
      // Set up request with missing username
      req.query = {};
      
      // Call the controller function
      chatController.getUserIdByName(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Username is required in query parameters." });
      
      // Verify database was not queried
      expect(connection.query).not.toHaveBeenCalled();
    });
    
    test('should return not found when username does not exist', () => {
      // Set up request query
      req.query = { username: 'NonExistentUser' };
      
      // Configure mock to return empty result
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(null, []);
      });
      
      // Call the controller function
      chatController.getUserIdByName(req, res);
      
      // Verify not found response
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found." });
    });
    
    test('should handle database error', () => {
      // Set up request query
      req.query = { username: 'User1' };
      
      // Configure mock to return error
      connection.query.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Database error'), null);
      });
      
      // Call the controller function
      chatController.getUserIdByName(req, res);
      
      // Verify error response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Database error." });
    });
  });
}); 