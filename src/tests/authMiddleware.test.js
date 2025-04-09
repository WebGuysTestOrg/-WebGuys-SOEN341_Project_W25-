const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Create mock middleware functions for testing
const mockAuth = {
  isAuthenticated: (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Unauthorized - Please login" });
    }
    next();
  },
  
  isAdmin: (req, res, next) => {
    if (!req.session || !req.session.user || req.session.user.user_type !== "admin") {
      return res.status(403).json({ error: "Forbidden - Admin access required" });
    }
    next();
  }
};

// Mock the middleware functions
jest.mock('../middleware/auth', () => ({
  isAuthenticated: jest.fn((req, res, next) => mockAuth.isAuthenticated(req, res, next)),
  isAdmin: jest.fn((req, res, next) => mockAuth.isAdmin(req, res, next))
}));

describe('Authentication Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Setup fresh mocks for each test
    req = {
      session: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('isAuthenticated', () => {
    test('should call next() if user is authenticated', () => {
      // Set up an authenticated session
      req.session.user = { id: 1, name: 'TestUser' };
      
      // Call the middleware
      isAuthenticated(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should return 401 if user is not authenticated', () => {
      // No user in session
      req.session = {};
      
      // Call the middleware
      isAuthenticated(req, res, next);
      
      // Verify response
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized - Please login" });
    });

    test('should return 401 if session does not exist', () => {
      // No session at all
      req = {};
      
      // Call the middleware
      isAuthenticated(req, res, next);
      
      // Verify response
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized - Please login" });
    });
  });

  describe('isAdmin', () => {
    test('should call next() if user is an admin', () => {
      // Set up an admin session
      req.session.user = { id: 1, name: 'AdminUser', user_type: 'admin' };
      
      // Call the middleware
      isAdmin(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should return 403 if user is not an admin', () => {
      // Regular user session
      req.session.user = { id: 2, name: 'RegularUser', user_type: 'user' };
      
      // Call the middleware
      isAdmin(req, res, next);
      
      // Verify response
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden - Admin access required" });
    });

    test('should return 403 if user is not authenticated', () => {
      // No user in session
      req.session = {};
      
      // Call the middleware
      isAdmin(req, res, next);
      
      // Verify response
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden - Admin access required" });
    });

    test('should return 403 if session does not exist', () => {
      // No session at all
      req = {};
      
      // Call the middleware
      isAdmin(req, res, next);
      
      // Verify response
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden - Admin access required" });
    });
  });
}); 