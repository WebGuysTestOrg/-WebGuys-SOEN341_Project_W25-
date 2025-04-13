// Mock db module before importing channelController
jest.mock('../config/db', () => require('./mockDb'));

const { resetMocks, mockQuery, mockPromisifiedQuery } = require('./mockDb');
const channelController = require('../controllers/channelController');

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

describe('Channel Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('createChannel', () => {
    it('should return 401 if user is not logged in', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;

      // Act
      await channelController.createChannel(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return 400 if channel name or team ID is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { teamId: 1 }; // Missing channelName

      // Act
      await channelController.createChannel(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Channel Name and Team ID are required." });
    });

    it('should return 403 if user is not a member of the team', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { channelName: 'Test Channel', teamId: 1 };
      
      // Mock query to return empty results (user not a team member)
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await channelController.createChannel(req, res);

      // Assert
      expect(mockPromisifiedQuery).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "You must be the creator or a member of the team to create a channel." 
      });
    });

    it('should create a channel successfully', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { channelName: 'Test Channel', teamId: 1 };
      
      // Mock query responses
      mockPromisifiedQuery.mockResolvedValueOnce([{ creatorId: 2, user_id: 1 }]); // User is team member
      mockPromisifiedQuery.mockResolvedValueOnce({ insertId: 100 }); // Channel created
      mockPromisifiedQuery.mockResolvedValueOnce({}); // User added to channel
      mockPromisifiedQuery.mockResolvedValueOnce({}); // Team creator added to channel

      // Act
      await channelController.createChannel(req, res);

      // Assert
      expect(mockPromisifiedQuery).toHaveBeenCalledTimes(4);
      expect(res.json).toHaveBeenCalledWith({ message: "Channel created successfully" });
    });
  });

  describe('getChannels', () => {
    it('should return 400 if team ID is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      
      // Act
      await channelController.getChannels(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team ID is required." });
    });

    it('should return 404 if no channels found', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.params.teamId = 1;
      
      // Mock query to return empty results
      mockPromisifiedQuery.mockResolvedValueOnce([]);

      // Act
      await channelController.getChannels(req, res);

      // Assert
      expect(mockPromisifiedQuery).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "No channels found for this team." });
    });

    it('should return channel names for a team', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.params.teamId = 1;
      
      const mockChannels = [
        { name: 'General' },
        { name: 'Random' }
      ];
      
      // Mock query to return channels
      mockPromisifiedQuery.mockResolvedValueOnce(mockChannels);

      // Act
      await channelController.getChannels(req, res);

      // Assert
      expect(mockPromisifiedQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ channels: ['General', 'Random'] });
    });
  });

  describe('getChannelMessages', () => {
    it('should return 400 if team or channel name is missing', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamName: 'Team1' }; // Missing channelName
      
      // Act
      await channelController.getChannelMessages(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Team name and channel name are required." });
    });

    it('should return messages for a channel', async () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { teamName: 'Team1', channelName: 'General' };
      
      const mockMessages = [
        { id: 1, sender: 'User1', text: 'Hello', quoted_message: null },
        { id: 2, sender: 'User2', text: 'Hi', quoted_message: 'Hello' }
      ];
      
      // Mock query to return messages
      mockPromisifiedQuery.mockResolvedValueOnce(mockMessages);

      // Act
      await channelController.getChannelMessages(req, res);

      // Assert
      expect(mockPromisifiedQuery).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith([
        { id: 1, sender: 'User1', text: 'Hello', quoted: null },
        { id: 2, sender: 'User2', text: 'Hi', quoted: 'Hello' }
      ]);
    });
  });
}); 