// Mock db module before importing chatController
jest.mock('../config/db', () => require('./mockDb'));

const { resetMocks, mockQuery } = require('./mockDb');
const chatController = require('../controllers/chatController');

// Mock Express req and res objects
const mockReq = () => {
  const req = {};
  req.body = {};
  req.query = {};
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

describe('Chat Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('getUserChats', () => {
    it('should return 400 if userId is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = {}; // Missing userId

      // Act
      chatController.getUserChats(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "User ID is required in query parameters." });
    });

    it('should return user chats successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { userId: 1 };
      
      const mockChatList = [
        { user_id: 2, username: 'User2' },
        { user_id: 3, username: 'User3' }
      ];
      
      // Mock query to return chat list
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, mockChatList);
      });

      // Act
      chatController.getUserChats(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(mockChatList);
    });

    it('should handle database errors', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { userId: 1 };
      
      // Mock query to throw an error
      mockQuery.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      // Act
      chatController.getUserChats(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Database error fetching chats." });
    });
  });

  describe('initChat', () => {
    it('should return 400 if userId or recipientId is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { userId: 1 }; // Missing recipientId

      // Act
      chatController.initChat(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Both user IDs (userId, recipientId) are required in the request body." 
      });
    });

    it('should return success if chat already exists', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { userId: 1, recipientId: 2 };
      
      // Mock query to return existing chat
      mockQuery.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM direct_messages')) {
          callback(null, [{ id: 5 }]);
        }
      });

      // Act
      chatController.initChat(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        success: true, 
        message: "Chat already exists" 
      });
    });

    it('should initialize chat successfully if it does not exist', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { userId: 1, recipientId: 2 };
      
      // Mock first query to return no existing chat
      mockQuery.mockImplementationOnce((query, params, callback) => {
        if (query.includes('SELECT id FROM direct_messages')) {
          callback(null, []);
        }
      });
      
      // Mock second query to succeed
      mockQuery.mockImplementationOnce((query, params, callback) => {
        if (query.includes('INSERT INTO direct_messages')) {
          callback(null, { insertId: 1 });
        }
      });

      // Act
      chatController.initChat(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ 
        success: true, 
        message: "Chat initialized successfully" 
      });
    });
  });

  describe('getDirectMessages', () => {
    it('should return 400 if senderId or recipientId is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { senderId: 1 }; // Missing recipientId

      // Act
      chatController.getDirectMessages(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Both senderId and recipientId are required in query parameters." 
      });
    });

    it('should return formatted messages successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { senderId: 1, recipientId: 2 };
      
      const mockMessages = [
        { 
          id: 1, 
          text: 'Hello', 
          sender_id: 1, 
          recipient_id: 2, 
          timestamp: '2023-01-01 10:00:00',
          senderName: 'User1'
        },
        { 
          id: 2, 
          text: 'Hi there', 
          sender_id: 2, 
          recipient_id: 1, 
          timestamp: '2023-01-01 10:01:00',
          senderName: 'User2'
        }
      ];
      
      // Mock query to return messages
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, mockMessages);
      });

      // Act
      chatController.getDirectMessages(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith([
        {
          id: 1,
          senderId: 1,
          recipientId: 2,
          senderName: 'User1',
          text: 'Hello',
          timestamp: '2023-01-01 10:00:00'
        },
        {
          id: 2,
          senderId: 2,
          recipientId: 1,
          senderName: 'User2',
          text: 'Hi there',
          timestamp: '2023-01-01 10:01:00'
        }
      ]);
    });
  });

  describe('getUserIdByName', () => {
    it('should return 400 if username is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = {}; // Missing username

      // Act
      chatController.getUserIdByName(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Username is required in query parameters." 
      });
    });

    it('should return 404 if user is not found', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { username: 'NonExistentUser' };
      
      // Mock query to return no results
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      // Act
      chatController.getUserIdByName(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found." });
    });

    it('should return user ID successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.query = { username: 'User1' };
      
      // Mock query to return user ID
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, [{ id: 1 }]);
      });

      // Act
      chatController.getUserIdByName(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ userId: 1 });
    });
  });
}); 