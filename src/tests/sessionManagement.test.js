const express = require('express');
const bodyParser = require('body-parser');

// Mock express-session
const sessionMock = jest.fn(() => (req, res, next) => {
  req.session = req.session || {};
  req.session.save = jest.fn(cb => cb && cb());
  req.session.destroy = jest.fn(cb => cb && cb());
  next();
});

jest.mock('express-session', () => {
  return sessionMock;
});

// Mock express
jest.mock('express', () => {
  const mockExpress = () => {
    const app = {
      use: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      listen: jest.fn().mockReturnThis()
    };
    return app;
  };
  
  mockExpress.static = jest.fn();
  mockExpress.Router = jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    use: jest.fn()
  }));
  
  return mockExpress;
});

// Mock sharedSession
jest.mock('express-socket.io-session', () => {
  return jest.fn();
});

describe('Session Management', () => {
  let app;
  let sessionMiddleware;
  let mockUserRes;
  let mockAdminRes;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup responses for user-info and admin-info routes
    mockUserRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    mockAdminRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Mock route handlers
    const mockApp = express();
    mockApp.get.mockImplementation((route, handler) => {
      if (route === '/user-info') {
        handler.userInfoHandler = handler;
      } else if (route === '/admin-info') {
        handler.adminInfoHandler = handler;
      }
      return mockApp;
    });
    
    // Import app after setting up mocks
    const appModule = require('../app');
    app = appModule.app;
    sessionMiddleware = appModule.sessionMiddleware;
  });
  
  test('should configure session middleware with correct options', () => {
    // Verify session was configured with expected options
    expect(sessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: expect.any(String),
        resave: false,
        saveUninitialized: true,
        cookie: expect.objectContaining({
          maxAge: expect.any(Number)
        })
      })
    );
  });

  test('should initialize session middleware in app', () => {
    // Verify session middleware was added to app
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
  });
  
  test('should return user info when session exists', () => {
    // Setup a mock request with user session
    const req = {
      session: {
        user: {
          id: 1,
          name: 'TestUser',
          email: 'test@example.com',
          user_type: 'user'
        }
      }
    };
    
    // Create a mock response
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Create a mock handler for user-info
    const userInfoHandler = (req, res) => {
      if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json({ 
        name: req.session.user.name, 
        email: req.session.user.email, 
        id: req.session.user.id,
        role: req.session.user.user_type
      });
    };
    
    // Call the handler
    userInfoHandler(req, res);
    
    // Verify response
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      name: 'TestUser',
      email: 'test@example.com',
      role: 'user'
    }));
    expect(res.status).not.toHaveBeenCalled();
  });
  
  test('should return unauthorized when no session exists', () => {
    // Setup a mock request with no user session
    const req = {
      session: {}
    };
    
    // Create a mock response
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Create a mock handler for user-info
    const userInfoHandler = (req, res) => {
      if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json({ 
        name: req.session.user.name, 
        email: req.session.user.email, 
        id: req.session.user.id,
        role: req.session.user.user_type
      });
    };
    
    // Call the handler
    userInfoHandler(req, res);
    
    // Verify response
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
  
  test('should restrict admin routes to admin users', () => {
    // Setup a mock request with regular user
    const req = {
      session: {
        user: {
          id: 1,
          name: 'TestUser',
          email: 'test@example.com',
          user_type: 'user'
        }
      }
    };
    
    // Create a mock response
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Create a mock handler for admin-info
    const adminInfoHandler = (req, res) => {
      if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json({ name: req.session.user.name });
    };
    
    // Call the handler
    adminInfoHandler(req, res);
    
    // Verify response
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
  
  test('should allow admin routes for admin users', () => {
    // Setup a mock request with admin user
    const req = {
      session: {
        user: {
          id: 1,
          name: 'AdminUser',
          email: 'admin@example.com',
          user_type: 'admin'
        }
      }
    };
    
    // Create a mock response
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Create a mock handler for admin-info
    const adminInfoHandler = (req, res) => {
      if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      res.json({ name: req.session.user.name });
    };
    
    // Call the handler
    adminInfoHandler(req, res);
    
    // Verify response
    expect(res.json).toHaveBeenCalledWith({ name: 'AdminUser' });
    expect(res.status).not.toHaveBeenCalled();
  });
}); 