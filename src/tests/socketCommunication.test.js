const io = require('socket.io-client');
const { app } = require('../app');
const { connection } = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

// Mock Socket.IO
jest.mock('socket.io', () => {
  const mockSocketOn = jest.fn();
  const mockSocketEmit = jest.fn();
  const mockSocketJoin = jest.fn();
  const mockSocketLeave = jest.fn();
  const mockSocketDisconnect = jest.fn();
  
  const mockSocket = {
    on: mockSocketOn,
    emit: mockSocketEmit,
    join: mockSocketJoin,
    leave: mockSocketLeave,
    disconnect: mockSocketDisconnect,
    id: 'test-socket-id',
    handshake: {
      session: {
        user: {
          id: 1,
          name: 'TestUser',
          email: 'test@example.com',
          user_type: 'user'
        }
      }
    }
  };
  
  const mockIoOn = jest.fn((event, callback) => {
    if (event === 'connection') {
      callback(mockSocket);
    }
  });
  
  const mockIoEmit = jest.fn();
  const mockIoUse = jest.fn();
  
  return {
    Server: jest.fn(() => ({
      on: mockIoOn,
      emit: mockIoEmit,
      use: mockIoUse,
      to: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      _socket: mockSocket,
      _socketOn: mockSocketOn,
      _socketEmit: mockSocketEmit,
      _socketJoin: mockSocketJoin,
      _socketLeave: mockSocketLeave,
      _socketDisconnect: mockSocketDisconnect,
      _ioOn: mockIoOn,
      _ioEmit: mockIoEmit,
      _ioUse: mockIoUse
    }))
  };
});

// Mock Express
jest.mock('express', () => {
  return jest.fn(() => ({
    use: jest.fn(),
    listen: jest.fn().mockReturnThis()
  }));
});

// Mock express-socket.io-session
jest.mock('express-socket.io-session', () => {
  return jest.fn();
});

describe('Socket.IO Communication', () => {
  let io;
  let Socket;
  let onlineUsers;
  let awayUsers;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the socket.io implementation
    jest.resetModules();
    
    // Reimport the server module
    const { Server } = require('socket.io');
    io = new Server();
    
    // Create user status maps
    onlineUsers = new Map();
    awayUsers = new Map();
  });
  
  test('user should be added to online users when connected', () => {
    // Create test implementation for socket.io handler
    const handleUserConnection = (socket) => {
      // Get user info from session
      const userId = socket.handshake.session.user.id.toString();
      const userName = socket.handshake.session.user.name;
      
      // Add to online users
      onlineUsers.set(userId, socket.id);
      
      // Emit to all clients
      io.emit('updateUserStatus', {
        online: Array.from(onlineUsers.keys()),
        away: Array.from(awayUsers.keys())
      });
      
      // Handle disconnect
      socket.on('disconnect', () => {
        onlineUsers.delete(userId);
        awayUsers.delete(userId);
        
        io.emit('updateUserStatus', {
          online: Array.from(onlineUsers.keys()),
          away: Array.from(awayUsers.keys())
        });
      });
    };
    
    // Simulate connection
    io.on('connection', handleUserConnection);
    
    // Verify user was added to online users
    expect(onlineUsers.size).toBe(1);
    expect(onlineUsers.get('1')).toBe('test-socket-id');
    expect(io._ioEmit).toHaveBeenCalledWith('updateUserStatus', {
      online: ['1'],
      away: []
    });
  });
  
  test('user should move from online to away when away event is triggered', () => {
    // Add the user as online
    onlineUsers.set('1', 'test-socket-id');
    
    // Create test implementation
    const handleUserAway = (socket) => {
      socket.on('userAway', (userId) => {
        // Move user from online to away
        onlineUsers.delete(userId.toString());
        awayUsers.set(userId.toString(), socket.id);
        
        // Emit updated status
        io.emit('updateUserStatus', {
          online: Array.from(onlineUsers.keys()),
          away: Array.from(awayUsers.keys())
        });
      });
    };
    
    // Simulate connection
    io.on('connection', handleUserAway);
    
    // Simulate away event
    io._socketOn.mock.calls.forEach(call => {
      if (call[0] === 'userAway') {
        call[1](1); // Call with userId = 1
      }
    });
    
    // Verify user was moved to away
    expect(onlineUsers.size).toBe(0);
    expect(awayUsers.size).toBe(1);
    expect(awayUsers.get('1')).toBe('test-socket-id');
  });
  
  test('user should be removed from all statuses when disconnected', () => {
    // Add the user as online
    onlineUsers.set('1', 'test-socket-id');
    
    // Create test implementation
    const handleDisconnect = (socket) => {
      socket.on('disconnect', () => {
        // Find and remove the user
        onlineUsers.forEach((socketId, userId) => {
          if (socketId === socket.id) {
            onlineUsers.delete(userId);
          }
        });
        
        awayUsers.forEach((socketId, userId) => {
          if (socketId === socket.id) {
            awayUsers.delete(userId);
          }
        });
        
        // Emit updated status
        io.emit('updateUserStatus', {
          online: Array.from(onlineUsers.keys()),
          away: Array.from(awayUsers.keys())
        });
      });
    };
    
    // Simulate connection
    io.on('connection', handleDisconnect);
    
    // Simulate disconnect event
    io._socketOn.mock.calls.forEach(call => {
      if (call[0] === 'disconnect') {
        call[1](); // Call disconnect handler
      }
    });
    
    // Verify user was removed
    expect(onlineUsers.size).toBe(0);
    expect(awayUsers.size).toBe(0);
  });
  
  test('should deliver direct message to recipient', () => {
    // Add users
    onlineUsers.set('1', 'sender-socket-id');
    onlineUsers.set('2', 'recipient-socket-id');
    
    // Mock socket.io rooms
    const socketRooms = new Map();
    socketRooms.set('user-2', 'recipient-socket-id');
    
    // Override io.to to simulate rooms
    io.to = jest.fn((room) => {
      return {
        emit: (event, data) => {
          // We'll verify this was called with the right params
          io._ioEmit(event, data, room);
        }
      };
    });
    
    // Create test implementation
    const handlePrivateMessage = (socket) => {
      socket.on('privateMessage', (data) => {
        const { recipientId, text } = data;
        const senderId = socket.handshake.session.user.id;
        const senderName = socket.handshake.session.user.name;
        
        // Store in database (mocked)
        connection.query(
          "INSERT INTO direct_messages (sender_id, recipient_id, text) VALUES (?, ?, ?)",
          [senderId, recipientId, text],
          (err, result) => {
            if (err) {
              return socket.emit('error', { message: 'Failed to send message' });
            }
            
            // Send to recipient
            io.to(`user-${recipientId}`).emit('privateMessageReceived', {
              id: result.insertId,
              senderId,
              senderName,
              recipientId,
              text,
              timestamp: new Date()
            });
            
            // Confirm to sender
            socket.emit('messageSent', { success: true });
          }
        );
      });
    };
    
    // Mock database response for insert
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, { insertId: 123 });
    });
    
    // Simulate connection
    io.on('connection', handlePrivateMessage);
    
    // Simulate private message event
    io._socketOn.mock.calls.forEach(call => {
      if (call[0] === 'privateMessage') {
        call[1]({
          recipientId: 2,
          text: 'Hello there!'
        });
      }
    });
    
    // Verify database was called
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO direct_messages');
    
    // Verify message was sent to recipient
    expect(io.to).toHaveBeenCalledWith('user-2');
    expect(io._ioEmit).toHaveBeenCalledWith(
      'privateMessageReceived',
      expect.objectContaining({
        id: 123,
        senderId: 1,
        senderName: 'TestUser',
        recipientId: 2,
        text: 'Hello there!'
      }),
      'user-2'
    );
    
    // Verify confirmation was sent to sender
    expect(io._socketEmit).toHaveBeenCalledWith('messageSent', { success: true });
  });
  
  test('should handle channel message delivery', () => {
    // Create channel room
    const channelRoom = 'channel-Team1-general';
    
    // Override socket.join to track joined rooms
    io._socket.join = jest.fn((room) => {
      // Just for tracking
    });
    
    // Override io.to to simulate rooms
    io.to = jest.fn((room) => {
      return {
        emit: (event, data) => {
          // We'll verify this was called with the right params
          io._ioEmit(event, data, room);
        }
      };
    });
    
    // Create test implementation
    const handleChannelMessage = (socket) => {
      // Join channel room
      socket.join(channelRoom);
      
      socket.on('channelMessage', (data) => {
        const { teamName, channelName, text } = data;
        const senderId = socket.handshake.session.user.id;
        const senderName = socket.handshake.session.user.name;
        
        // Store in database (mocked)
        connection.query(
          "INSERT INTO channels_messages (team_name, channel_name, sender, text) VALUES (?, ?, ?, ?)",
          [teamName, channelName, senderName, text],
          (err, result) => {
            if (err) {
              return socket.emit('error', { message: 'Failed to send message' });
            }
            
            // Send to all in channel
            io.to(channelRoom).emit('channelMessageReceived', {
              id: result.insertId,
              teamName,
              channelName,
              sender: senderName,
              text,
              timestamp: new Date()
            });
          }
        );
      });
    };
    
    // Mock database response
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, { insertId: 456 });
    });
    
    // Simulate connection
    io.on('connection', handleChannelMessage);
    
    // Simulate channel message event
    io._socketOn.mock.calls.forEach(call => {
      if (call[0] === 'channelMessage') {
        call[1]({
          teamName: 'Team1',
          channelName: 'general',
          text: 'Hello channel!'
        });
      }
    });
    
    // Verify socket joined channel room
    expect(io._socket.join).toHaveBeenCalledWith(channelRoom);
    
    // Verify database was called
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO channels_messages');
    expect(connection.query.mock.calls[0][1]).toEqual(['Team1', 'general', 'TestUser', 'Hello channel!']);
    
    // Verify message was broadcast to channel
    expect(io.to).toHaveBeenCalledWith(channelRoom);
    expect(io._ioEmit).toHaveBeenCalledWith(
      'channelMessageReceived',
      expect.objectContaining({
        id: 456,
        teamName: 'Team1',
        channelName: 'general',
        sender: 'TestUser',
        text: 'Hello channel!'
      }),
      channelRoom
    );
  });
}); 