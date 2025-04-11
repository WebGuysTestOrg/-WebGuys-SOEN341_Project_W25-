const connection = require('../config/db');
const {
  createChannel,
  getChannels,
  getUserChannels,
  assignUser,
  getChannelMessages,
  sendChannelMessage,
  removeMessage
} = require('../controllers/channelController');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Channel Operations', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
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

  const verifyChannelCreated = (res) => {
    expect(res.json).toHaveBeenCalledWith({
      message: "Channel created successfully. Creator added automatically."
    });
  };

  test('mocking works correctly', () => {
    expect(connection.query).not.toHaveBeenCalled();
    expect(res.status().json).not.toHaveBeenCalled();
    expect(req.session.user.id).toBe(1);
  });

  test('should create a channel successfully', async () => {
    req.body = { channelName: 'test-channel', teamId: 1 };

    connection.query
      .mockImplementationOnce((query, params, callback) => callback(null, [{ user_id: 1, creatorId: 1 }]))
      .mockImplementationOnce((query, params, callback) => callback(null, { insertId: 1 }))
      .mockImplementationOnce((query, params, callback) => callback(null, {}));

    await createChannel(req, res);
    verifyChannelCreated(res);
  });

  test('should prevent creating channel if not a team member', async () => {
    req.body = { channelName: 'new-channel', teamId: 2 };

    connection.query.mockImplementationOnce((query, params, callback) => callback(null, []));

    await createChannel(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "You must be the creator or a member of the team to create a channel." });
  });

  test('should get all channels for a team', async () => {
    req.body = { teamId: 1 };

    const mockChannels = [{ name: 'general' }, { name: 'random' }];

    connection.query.mockImplementationOnce((query, params, callback) => callback(null, mockChannels));

    await getChannels(req, res);

    expect(res.json).toHaveBeenCalledWith({ channels: ['general', 'random'] });
  });

  test('should fetch messages', async () => {
    req.body = { teamName: 'Test Team', channelName: 'general' };

    const messages = [{ id: 1, sender: 'User1', text: 'Hi', quoted_message: null }];

    connection.query.mockImplementationOnce((query, params, callback) => callback(null, messages));

    await getChannelMessages(req, res);

    expect(res.json).toHaveBeenCalledWith([
      { id: 1, sender: 'User1', text: 'Hi', quoted: null }
    ]);
  });

  test('should send a message successfully', async () => {
    req.body = {
      teamName: 'Test Team',
      channelName: 'general',
      sender: 'TestUser',
      text: 'Hello',
      quoted: null
    };

    connection.query.mockImplementationOnce((query, params, callback) => callback(null, {}));

    await sendChannelMessage(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('should join channel successfully', async () => {
    req.body = { 
      teamId: 1, 
      channelName: 'general', 
      userName: 'TestUser' 
    };
  
    connection.query
      .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 1 }])) // user exists
      .mockImplementationOnce((query, params, callback) => callback(null, [{ user_id: 1 }])) // user in team
      .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 1 }])) // channel exists
      .mockImplementationOnce((query, params, callback) => callback(null, [])) // not in channel
      .mockImplementationOnce((query, params, callback) => callback(null, {})) // insert success
      .mockImplementationOnce((query, params, callback) => callback(null, [{ name: 'TestUser' }])) // members
  
    await assignUser(req, res);
  
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: "User added to channel successfully"
    }));
  });
  
  test('should prevent joining channel twice', async () => {
    req.body = { 
      teamId: 1, 
      channelName: 'general', 
      userName: 'TestUser' 
    };
  
    connection.query
      .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 1 }])) // user exists
      .mockImplementationOnce((query, params, callback) => callback(null, [{ user_id: 1 }])) // user in team
      .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 1 }])) // channel exists
      .mockImplementationOnce((query, params, callback) => callback(null, [{ user_id: 1 }])) // already in channel
  
    await assignUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "User is already a member of this channel" });
  });
  
  test('should handle database error correctly', async () => {
    req.body = { teamId: 1 };
  
    connection.query.mockImplementationOnce((query, params, callback) => callback(new Error('DB error'), null));
  
    await getChannels(req, res);
  
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error: Database query failed." });
  });
  

});


