const request = require('supertest');
const { app } = require('../app');
const { connection } = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn(),
  beginTransaction: jest.fn((callback) => callback(null)),
  commit: jest.fn((callback) => callback(null)),
  rollback: jest.fn((callback) => callback(null))
}));

describe('User Login', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('should login successfully with valid credentials', async () => {
    // Mock user record in database
    const mockUser = {
      id: 1,
      name: 'TestUser',
      email: 'test@example.com',
      password: '9a79be611e0267e1d943da0737c6c51a', // md5 hash of 'Password123'
      user_type: 'user'
    };

    // Mock database response for user lookup
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - user lookup
        callback(null, [mockUser]);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - activity log
        callback(null, { insertId: 1 });
      });

    // Login credentials
    const loginData = {
      email: 'test@example.com',
      password: 'Password123'
    };

    // Make request to login endpoint
    const response = await request(app)
      .post('/login')
      .send(loginData);

    // Assertions
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('redirect', '/UserDashboard.html');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toEqual({
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
      user_type: mockUser.user_type
    });
    
    // Verify database was queried correctly
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT * FROM user_form WHERE email = ? AND password = ?');
    
    // Verify activity log was updated
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO user_activity_log');
    expect(connection.query.mock.calls[1][1]).toEqual([mockUser.id, mockUser.name]);
  });

  test('should login as admin and redirect to admin dashboard', async () => {
    // Mock admin user record
    const mockAdmin = {
      id: 2,
      name: 'AdminUser',
      email: 'admin@example.com',
      password: '9a79be611e0267e1d943da0737c6c51a', // md5 hash of 'Password123'
      user_type: 'admin'
    };

    // Mock database response for admin lookup
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - user lookup
        callback(null, [mockAdmin]);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - activity log
        callback(null, { insertId: 2 });
      });

    // Admin login credentials
    const loginData = {
      email: 'admin@example.com',
      password: 'Password123'
    };

    // Make request to login endpoint
    const response = await request(app)
      .post('/login')
      .send(loginData);

    // Assertions
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('redirect', '/AdminDashboard.html');
    expect(response.body.user.user_type).toBe('admin');
  });

  test('should return error with invalid credentials', async () => {
    // Mock empty response (no user found)
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(null, []);
    });

    // Invalid login credentials
    const loginData = {
      email: 'test@example.com',
      password: 'WrongPassword'
    };

    // Make request to login endpoint
    const response = await request(app)
      .post('/login')
      .send(loginData);

    // Assertions
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid email or password.');
    
    // Verify database was queried
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('should return error with missing credentials', async () => {
    // Test with missing email
    const missingEmailData = {
      password: 'Password123'
    };

    const responseNoEmail = await request(app)
      .post('/login')
      .send(missingEmailData);

    expect(responseNoEmail.status).toBe(400);
    expect(responseNoEmail.body).toHaveProperty('error', 'Email and password are required.');
    expect(connection.query).not.toHaveBeenCalled();

    // Test with missing password
    const missingPasswordData = {
      email: 'test@example.com'
    };

    const responseNoPassword = await request(app)
      .post('/login')
      .send(missingPasswordData);

    expect(responseNoPassword.status).toBe(400);
    expect(responseNoPassword.body).toHaveProperty('error', 'Email and password are required.');
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('should handle database error during login', async () => {
    // Mock a database error
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(new Error('Database connection error'), null);
    });

    const loginData = {
      email: 'test@example.com',
      password: 'Password123'
    };

    const response = await request(app)
      .post('/login')
      .send(loginData);

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Server error. Please try again later.');
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
}); 