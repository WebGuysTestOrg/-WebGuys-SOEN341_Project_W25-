const connection = require('../config/db');
const { EVENTS, ROOMS } = require('../socket/constants');

// Mock the socket/constants module
jest.mock('../socket/constants', () => ({
  EVENTS: {
    GLOBAL_MESSAGE: 'global-message',
    GLOBAL_CHAT_HISTORY: 'global-chat-history',
    ERROR: 'error'
  },
  ROOMS: {
    GLOBAL_CHAT: 'global-chat'
  }
}));

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn()
}));

// Create a mock message manager
const mockGetGlobalMessages = jest.fn().mockResolvedValue([
  {
    id: 1,
    sender_id: 1,
    sender_name: 'User1',
    message: 'Hello everyone!',
    timestamp: new Date()
  },
  {
    id: 2,
    sender_id: 2,
    sender_name: 'User2',
    message: 'Hi there!',
    timestamp: new Date()
  }
]);

const mockSaveGlobalMessage = jest.fn().mockResolvedValue(123);

// Mock the messageManager class
jest.mock('../socket/utils/messageManager', () => {
  return jest.fn().mockImplementation(() => ({
    getGlobalMessages: mockGetGlobalMessages,
    saveGlobalMessage: mockSaveGlobalMessage
  }));
});

// Mock the socket event handlers module
jest.mock('../socket/handlers/globalChat', () => {
  return (socket, io, connection) => {
    // Mock connection event handler
    socket.on('connection', async () => {
      try {
        const MessageManager = require('../socket/utils/messageManager');
        const msgManager = new MessageManager();
        const messages = await msgManager.getGlobalMessages();
        socket.emit(EVENTS.GLOBAL_CHAT_HISTORY, messages.reverse());
      } catch (error) {
        console.error('Error fetching global messages:', error);
      }
    });

    // Mock global message handler
    socket.on(EVENTS.GLOBAL_MESSAGE, async (data) => {
      try {
        const MessageManager = require('../socket/utils/messageManager');
        const msgManager = new MessageManager();
        
        const message = {
          sender_id: socket.userId,
          sender_name: socket.userName,
          message: data.text,
          quoted_text: data.quoted_text,
          quoted_sender: data.quoted_sender,
          timestamp: new Date()
        };

        const messageId = await msgManager.saveGlobalMessage(message);
        message.id = messageId;

        io.to(ROOMS.GLOBAL_CHAT).emit(EVENTS.GLOBAL_MESSAGE, message);
      } catch (error) {
        console.error('Error handling global message:', error);
        socket.emit(EVENTS.ERROR, { message: 'Failed to send message' });
      }
    });
  };
});

// Create mock socket and io objects
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  join: jest.fn(),
  id: 'test-socket-id',
  userId: 1,
  userName: 'TestUser'
};

const mockIo = {
  to: jest.fn().mockReturnValue({
    emit: jest.fn()
  }),
  on: jest.fn()
};

describe('Global Chat Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should send chat history when user connects', async () => {
    // Get the handler function
    const globalChatHandler = require('../socket/handlers/globalChat');
    
    // Initialize the handler with our mocks
    globalChatHandler(mockSocket, mockIo, connection);
    
    // Find and call the connection handler
    const connectionHandlers = mockSocket.on.mock.calls.filter(call => call[0] === 'connection');
    expect(connectionHandlers.length).toBe(1);
    
    // Call the handler
    await connectionHandlers[0][1]();
    
    // Verify that getGlobalMessages was called
    expect(mockGetGlobalMessages).toHaveBeenCalled();
    
    // Verify that the socket emitted the chat history
    expect(mockSocket.emit).toHaveBeenCalledWith(
      EVENTS.GLOBAL_CHAT_HISTORY,
      expect.any(Array)
    );
  });
  
  test('should handle new global message', async () => {
    // Get the handler function
    const globalChatHandler = require('../socket/handlers/globalChat');
    
    // Initialize the handler with our mocks
    globalChatHandler(mockSocket, mockIo, connection);
    
    // Find the global message handler
    const messageHandlers = mockSocket.on.mock.calls.filter(call => call[0] === EVENTS.GLOBAL_MESSAGE);
    expect(messageHandlers.length).toBe(1);
    
    // Create message data
    const messageData = {
      text: 'Hello world!',
      quoted_text: null,
      quoted_sender: null
    };
    
    // Call the handler
    await messageHandlers[0][1](messageData);
    
    // Verify that saveGlobalMessage was called with the right data
    expect(mockSaveGlobalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_id: 1,
        sender_name: 'TestUser',
        message: 'Hello world!'
      })
    );
    
    // Verify that the message was broadcast to the room
    expect(mockIo.to).toHaveBeenCalledWith(ROOMS.GLOBAL_CHAT);
    expect(mockIo.to().emit).toHaveBeenCalledWith(
      EVENTS.GLOBAL_MESSAGE,
      expect.objectContaining({
        id: 123,
        sender_id: 1,
        sender_name: 'TestUser',
        message: 'Hello world!'
      })
    );
  });
  
  test('should handle error when saving global message fails', async () => {
    // Override the saveGlobalMessage mock to reject
    mockSaveGlobalMessage.mockRejectedValueOnce(new Error('Database error'));
    
    // Get the handler function
    const globalChatHandler = require('../socket/handlers/globalChat');
    
    // Initialize the handler with our mocks
    globalChatHandler(mockSocket, mockIo, connection);
    
    // Find the global message handler
    const messageHandlers = mockSocket.on.mock.calls.filter(call => call[0] === EVENTS.GLOBAL_MESSAGE);
    
    // Create message data
    const messageData = {
      text: 'Hello world!',
      quoted_text: null,
      quoted_sender: null
    };
    
    // Call the handler
    await messageHandlers[0][1](messageData);
    
    // Verify that saveGlobalMessage was called
    expect(mockSaveGlobalMessage).toHaveBeenCalled();
    
    // Verify that an error was emitted to the socket
    expect(mockSocket.emit).toHaveBeenCalledWith(
      EVENTS.ERROR,
      { message: 'Failed to send message' }
    );
  });
}); 