// Mock db module before importing messageController
jest.mock('../config/db', () => require('./mockDb'));

const { resetMocks, mockQuery, mockPromisifiedQuery } = require('./mockDb');
const messageController = require('../controllers/messageController');

// Directly mock the util.promisify(connection.query) function
jest.mock('util', () => ({
  promisify: jest.fn(() => mockPromisifiedQuery)
}));

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

describe('Message Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('removeMessage', () => {
    it('should return 400 if messageId is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = {}; // Missing messageId

      // Act
      messageController.removeMessage(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Message ID is required." });
    });

    it('should remove message successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { messageId: 1 };
      
      // Mock query to succeed
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, { affectedRows: 1 });
      });

      // Act
      messageController.removeMessage(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle database errors', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { messageId: 1 };
      
      // Mock query to throw an error
      mockQuery.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      // Act
      messageController.removeMessage(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Database update failed." });
    });
  });

  // describe('pinDirectMessage', () => {
  //   it('should return 404 if message is not found', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.params = { id: 999 };
      
  //     // Mock query to return no message
  //     mockPromisifiedQuery.mockResolvedValue([]);

  //     // Act
  //     await messageController.pinDirectMessage(req, res);

  //     // Assert
  //     expect(res.status).toHaveBeenCalledWith(404);
  //     expect(res.json).toHaveBeenCalledWith({ error: 'Message not found' });
  //   });

  //   it('should pin message successfully', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.params = { id: 1 };
      
  //     // Mock queries - we need to set up the implementations separately
  //     // First call returns message details
  //     mockPromisifiedQuery.mockResolvedValueOnce([{ sender_id: 1, recipient_id: 2 }]);
  //     // Second call is for unpinning existing messages (returns empty for success)
  //     mockPromisifiedQuery.mockResolvedValueOnce({});
  //     // Third call is for pinning the new message (returns empty for success)
  //     mockPromisifiedQuery.mockResolvedValueOnce({});

  //     // Act
  //     await messageController.pinDirectMessage(req, res);

  //     // Assert
  //     expect(mockPromisifiedQuery).toHaveBeenCalledTimes(3);
  //     expect(res.json).toHaveBeenCalledWith({ message: 'Message pinned successfully' });
  //   });

  //   it('should handle database errors', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.params = { id: 1 };
      
  //     // Mock query to throw an error
  //     mockPromisifiedQuery.mockRejectedValue(new Error('Database error'));

  //     // Act
  //     await messageController.pinDirectMessage(req, res);

  //     // Assert
  //     expect(res.status).toHaveBeenCalledWith(500);
  //     expect(res.json).toHaveBeenCalledWith({ error: 'Error pinning message' });
  //   });
  // });

  // describe('unpinDirectMessage', () => {
  //   it('should unpin message successfully', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.params = { id: 1 };
      
  //     // Mock query to succeed
  //     mockPromisifiedQuery.mockResolvedValue({});

  //     // Act
  //     await messageController.unpinDirectMessage(req, res);

  //     // Assert
  //     expect(mockPromisifiedQuery).toHaveBeenCalledTimes(1);
  //     expect(res.json).toHaveBeenCalledWith({ success: true });
  //   });

  //   it('should handle database errors', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.params = { id: 1 };
      
  //     // Mock query to throw an error
  //     mockPromisifiedQuery.mockRejectedValue(new Error('Database error'));

  //     // Act
  //     await messageController.unpinDirectMessage(req, res);

  //     // Assert
  //     expect(res.status).toHaveBeenCalledWith(500);
  //     expect(res.json).toHaveBeenCalledWith({ error: 'Failed to unpin message' });
  //   });
  // });

  // describe('getPinnedDirectMessage', () => {
  //   it('should return 400 if senderId or recipientId is missing', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.query = { senderId: 1 }; // Missing recipientId

  //     // Act
  //     await messageController.getPinnedDirectMessage(req, res);

  //     // Assert
  //     expect(res.status).toHaveBeenCalledWith(400);
  //     expect(res.json).toHaveBeenCalledWith({ error: 'Missing senderId or recipientId in query' });
  //   });

  //   it('should return pinned message successfully', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.query = { senderId: 1, recipientId: 2 };
      
  //     const mockPinnedMessage = { 
  //       id: 1, 
  //       text: 'Pinned message', 
  //       sender_id: 1, 
  //       recipient_id: 2 
  //     };
      
  //     // Mock query to return pinned message
  //     mockPromisifiedQuery.mockResolvedValue([mockPinnedMessage]);

  //     // Act
  //     await messageController.getPinnedDirectMessage(req, res);

  //     // Assert
  //     expect(res.json).toHaveBeenCalledWith(mockPinnedMessage);
  //   });

  //   it('should return null if no pinned message found', async () => {
  //     // Arrange
  //     const req = mockReq();
  //     const res = mockRes();
  //     req.query = { senderId: 1, recipientId: 2 };
      
  //     // Mock query to return no pinned message
  //     mockPromisifiedQuery.mockResolvedValue([]);

  //     // Act
  //     await messageController.getPinnedDirectMessage(req, res);

  //     // Assert
  //     expect(res.json).toHaveBeenCalledWith(null);
  //   });
  // });
}); 