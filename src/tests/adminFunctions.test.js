const request = require('supertest');
const { app } = require('../app');
const { connection } = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Admin Functions', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockRequest();
    res = mockResponse();
  });

  describe('User Management', () => {
    test('should get all users', () => {
      const mockUsers = [
        { id: 1, name: 'AdminUser', email: 'admin@example.com', user_type: 'admin', status: 'active' },
        { id: 2, name: 'User1', email: 'user1@example.com', user_type: 'user', status: 'active' }
      ];

      connection.query.mockImplementationOnce((query, params, callback) => callback(null, mockUsers));

      getAllUsers(req, res);

      expect(connection.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(mockUsers);
    });

    test('should change user status', () => {
      req.body = { userId: 2, status: 'inactive' };

      mockUpdateUserStatusQueries();

      updateUserStatus(req, res);

      expect(connection.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: "User status updated successfully",
        user: expect.objectContaining({ id: 2, status: 'inactive' })
      }));
    });

    test('should not allow non-admin users', () => {
      req.session.user.user_type = 'user';
      req.body = { userId: 2, status: 'inactive' };

      updateUserStatus(req, res);

      expect(connection.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Content Moderation', () => {
    test('should remove inappropriate message', () => {
      req.body = { messageId: 123, action: 'remove', reason: 'Bad words' };

      mockModerateMessageQueries();

      moderateMessage(req, res);

      expect(connection.query).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith({
        message: "Message moderated successfully",
        action: 'remove'
      });
    });
  });

  describe('System Monitoring', () => {
    test('should get system statistics', () => {
      mockSystemStatsQueries();

      getSystemStats(req, res);

      expect(connection.query).toHaveBeenCalledTimes(6);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: "System statistics retrieved successfully"
      }));
    });
  });
});


// ===================
// Helper Functions
// ===================

const mockRequest = () => ({
  body: {},
  params: {},
  query: {},
  session: { user: { id: 1, name: 'AdminUser', email: 'admin@example.com', user_type: 'admin' } },
  app: {
    get: jest.fn().mockReturnValue({
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis()
    })
  }
});

const mockResponse = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis()
});

const mockUpdateUserStatusQueries = () => {
  connection.query
    .mockImplementationOnce((query, params, callback) => callback(null, { affectedRows: 1 }))
    .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 2, name: 'User1', status: 'inactive' }]));
};

const mockModerateMessageQueries = () => {
  connection.query
    .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 123, team_name: 'Team1', channel_name: 'general', sender: 'UserX', sender_id: 5, text: 'Bad' }]))
    .mockImplementationOnce((query, params, callback) => callback(null, { affectedRows: 1 }))
    .mockImplementationOnce((query, params, callback) => callback(null, { insertId: 1 }));
};

const mockSystemStatsQueries = () => {
  const results = [
    [{ userCount: 150 }],
    [{ teamCount: 25 }],
    [{ channelCount: 120 }],
    [{ messageCount: 3500 }],
    [{ activeUsers: 75 }],
    [{ moderationCount: 12 }]
  ];
  results.forEach(result => {
    connection.query.mockImplementationOnce((query, params, callback) => callback(null, result));
  });
};


// ===================
// Functions Under Test
// ===================

const getAllUsers = (req, res) => {
  if (req.session.user.user_type !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }

  connection.query(
    "SELECT id, name, email, user_type, status, created_at FROM user_form ORDER BY id",
    [],
    (err, users) => {
      if (err) return res.status(500).json({ error: "Error fetching users" });
      res.json(users);
    }
  );
};

const updateUserStatus = (req, res) => {
  const { userId, status } = req.body;
  if (req.session.user.user_type !== 'admin') return res.status(403).json({ error: "Admin access required" });
  if (!userId || !status) return res.status(400).json({ error: "User ID and status are required" });
  if (!['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: "Invalid status value" });

  connection.query(
    "UPDATE user_form SET status = ? WHERE id = ?",
    [status, userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Error updating user status" });
      if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

      connection.query(
        "SELECT id, name, email, user_type, status FROM user_form WHERE id = ?",
        [userId],
        (err, users) => {
          if (err) return res.status(500).json({ error: "Error fetching updated user" });

          const io = req.app.get('io');
          io?.emit('userStatusChanged', { userId, status, updatedBy: req.session.user.id });

          res.json({ message: "User status updated successfully", user: users[0] });
        }
      );
    }
  );
};

const moderateMessage = (req, res) => {
  const { messageId, action, reason } = req.body;
  const adminId = req.session.user.id;
  const adminName = req.session.user.name;

  if (req.session.user.user_type !== 'admin') return res.status(403).json({ error: "Admin access required" });

  connection.query(
    "SELECT id, team_name, channel_name, sender, user_id AS sender_id, text FROM channels_messages WHERE id = ?",
    [messageId],
    (err, messages) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (messages.length === 0) return res.status(404).json({ error: "Message not found" });

      const message = messages[0];
      if (action !== 'remove') return res.status(400).json({ error: "Invalid moderation action" });

      connection.query(
        "UPDATE channels_messages SET text = 'Message removed by moderator', moderated = 1 WHERE id = ?",
        [messageId],
        (err) => {
          if (err) return res.status(500).json({ error: "Error removing message" });

          connection.query(
            "INSERT INTO moderation_log (moderator_id, action, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
            [adminId, 'remove_message', 'message', messageId, reason],
            () => {
              const io = req.app.get('io');
              io?.to(`channel-${message.team_name}-${message.channel_name}`).emit('messageModerated', {
                messageId, action, moderatorId: adminId, moderatorName: adminName
              });
              res.json({ message: "Message moderated successfully", action });
            }
          );
        }
      );
    }
  );
};

const getSystemStats = (req, res) => {
  if (req.session.user.user_type !== 'admin') return res.status(403).json({ error: "Admin access required" });

  const stats = {};
  let completedQueries = 0;
  const queries = [
    ["SELECT COUNT(*) AS userCount FROM user_form", 'totalUsers'],
    ["SELECT COUNT(*) AS teamCount FROM teams", 'totalTeams'],
    ["SELECT COUNT(*) AS channelCount FROM channels", 'totalChannels'],
    ["SELECT COUNT(*) AS messageCount FROM channels_messages", 'totalMessages'],
    ["SELECT COUNT(DISTINCT user_id) AS activeUsers FROM user_activity_log WHERE DATE(login_time) = CURDATE()", 'activeUsersToday'],
    ["SELECT COUNT(*) AS moderationCount FROM moderation_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)", 'moderationActions7Days']
  ];

  queries.forEach(([query, key]) => {
    connection.query(query, [], (err, result) => {
      if (err) return res.status(500).json({ error: "Error fetching statistics" });

      stats[key] = result[0][Object.keys(result[0])[0]];
      completedQueries++;

      if (completedQueries === queries.length) {
        res.json({ message: "System statistics retrieved successfully", stats });
      }
    });
  });
};
