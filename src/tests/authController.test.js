// Mock db module before importing authController
jest.mock('../config/db', () => require('./mockDb'));

// Mock crypto module
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('hashed_password')
}));

const { resetMocks, mockQuery } = require('./mockDb');
const authController = require('../controllers/authController');

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
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('register', () => {
    it('should return 400 if any required field is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = {
        name: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        // cpassword is missing
        user_type: 'user'
      };

      // Act
      authController.register(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "All fields are required." });
    });

    it('should return 400 if email format is invalid', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = {
        name: 'testuser',
        email: 'invalid-email',
        password: 'password123',
        cpassword: 'password123',
        user_type: 'user'
      };

      // Act
      authController.register(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid email format." });
    });

    it('should return 400 if passwords do not match', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = {
        name: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        cpassword: 'different_password',
        user_type: 'user'
      };

      // Act
      authController.register(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Passwords do not match!" });
    });
  });

  describe('login', () => {
    it('should return 400 if email or password is missing', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com' }; // Missing password

      // Act
      authController.login(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Email and password are required." });
    });

    it('should return 401 if user not found', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com', password: 'password123' };

      // Mock query to return empty results (user not found)
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      // Act
      authController.login(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid email or password." });
    });

    it('should set session and redirect to UserDashboard for regular user', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'test@example.com', password: 'password123' };

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        user_type: 'user'
      };

      // Mock query to return user (login successful)
      mockQuery.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT * FROM user_form')) {
          callback(null, [mockUser]);
        } else {
          callback(null, { affectedRows: 1 });
        }
      });

      // Act
      authController.login(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(2); // One for login, one for activity log
      expect(req.session.user).toEqual({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        user_type: 'user'
      });
      expect(res.json).toHaveBeenCalledWith({
        redirect: "/User-Dashboard.html",
        user: req.session.user
      });
    });

    it('should set session and redirect to AdminDashboard for admin user', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.body = { email: 'admin@example.com', password: 'password123' };

      const mockUser = {
        id: 1,
        name: 'Admin User',
        email: 'admin@example.com',
        user_type: 'admin'
      };

      // Mock query to return admin user
      mockQuery.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT * FROM user_form')) {
          callback(null, [mockUser]);
        } else {
          callback(null, { affectedRows: 1 });
        }
      });

      // Act
      authController.login(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(req.session.user).toEqual({
        id: 1,
        name: 'Admin User',
        email: 'admin@example.com',
        user_type: 'admin'
      });
      expect(res.json).toHaveBeenCalledWith({
        redirect: "/Admin-Dashboard.html",
        user: req.session.user
      });
    });
  });

  describe('getUserInfo', () => {
    it('should return 401 if user is not logged in', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;

      // Act
      authController.getUserInfo(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return user info if user is logged in', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        user_type: 'user'
      };

      // Act
      authController.getUserInfo(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      });
    });
  });

  describe('updatePassword', () => {
    it('should return 401 if user is not logged in', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = null;
      req.body = { newPassword: 'newpass123', confirmPassword: 'newpass123' };

      // Act
      authController.updatePassword(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it('should return 400 if passwords do not match', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { newPassword: 'newpass123', confirmPassword: 'different' };

      // Act
      authController.updatePassword(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Passwords do not match!" });
    });

    it('should update password successfully', () => {
      // Arrange
      const req = mockReq();
      const res = mockRes();
      req.session.user = { id: 1 };
      req.body = { newPassword: 'newpass123', confirmPassword: 'newpass123' };

      // Mock query to simulate successful password update
      mockQuery.mockImplementation((query, params, callback) => {
        callback(null, { affectedRows: 1 });
      });

      // Act
      authController.updatePassword(req, res);

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Password updated successfully!" });
    });
  });
}); 