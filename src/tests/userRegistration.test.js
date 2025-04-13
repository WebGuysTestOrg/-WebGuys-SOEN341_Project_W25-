const request = require('supertest');
// Import server instead of app since registration routes are in server.js
const { app } = require('../app');
const { connection } = require('../config/db');

// Mock the database connection
jest.mock('../config/db', () => ({
  query: jest.fn(),
  beginTransaction: jest.fn((callback) => callback(null)),
  commit: jest.fn((callback) => callback(null)),
  rollback: jest.fn((callback) => callback(null))
}));

describe('User Registration', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('should register a new user with valid data', async () => {
    // Mock database responses for email and username checks (no existing user found)
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - email check
        callback(null, []);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - username check
        callback(null, []);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Third call - user insertion
        callback(null, { insertId: 1 });
      });

    // Valid user data
    const userData = {
      name: 'TestUser',
      email: 'test@example.com',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    // Make request to register endpoint
    const response = await request(app)
      .post('/register')
      .send(userData);

    // Assertions
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('redirect', '/Login-Form.html');
    
    // Verify database was called correctly
    expect(connection.query).toHaveBeenCalledTimes(3);
    
    // Verify first call was to check email
    expect(connection.query.mock.calls[0][0]).toContain('SELECT id FROM user_form WHERE email = ?');
    expect(connection.query.mock.calls[0][1]).toEqual(['test@example.com']);
    
    // Verify second call was to check username
    expect(connection.query.mock.calls[1][0]).toContain('SELECT id FROM user_form WHERE name = ?');
    expect(connection.query.mock.calls[1][1]).toEqual(['TestUser']);
    
    // Verify third call was to insert user (password should be hashed)
    expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO user_form');
    expect(connection.query.mock.calls[2][1][0]).toBe('TestUser');
    expect(connection.query.mock.calls[2][1][1]).toBe('test@example.com');
    // Check that the password is hashed (not checking exact hash, just that it's different)
    expect(connection.query.mock.calls[2][1][2]).not.toBe('Password123');
    expect(connection.query.mock.calls[2][1][3]).toBe('user');
  });

  test('should return error when missing required fields', async () => {
    // Test with missing name
    const missingNameData = {
      email: 'test@example.com',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const responseNoName = await request(app)
      .post('/register')
      .send(missingNameData);

    expect(responseNoName.status).toBe(400);
    expect(responseNoName.body).toHaveProperty('error', 'All fields are required.');
    expect(connection.query).not.toHaveBeenCalled();

    // Test with missing email
    const missingEmailData = {
      name: 'TestUser',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const responseNoEmail = await request(app)
      .post('/register')
      .send(missingEmailData);

    expect(responseNoEmail.status).toBe(400);
    expect(responseNoEmail.body).toHaveProperty('error', 'All fields are required.');
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('should return error for invalid email format', async () => {
    const invalidEmailData = {
      name: 'TestUser',
      email: 'invalid-email', // Invalid email format
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const response = await request(app)
      .post('/register')
      .send(invalidEmailData);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Invalid email format.');
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('should return error when passwords do not match', async () => {
    const mismatchPasswordData = {
      name: 'TestUser',
      email: 'test@example.com',
      password: 'Password123',
      cpassword: 'DifferentPassword', // Mismatched password
      user_type: 'user'
    };

    const response = await request(app)
      .post('/register')
      .send(mismatchPasswordData);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Passwords do not match!');
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('should return error when email is already in use', async () => {
    // Mock database response to simulate existing email
    connection.query.mockImplementationOnce((query, params, callback) => {
      // Return a result to indicate email exists
      callback(null, [{ id: 1 }]);
    });

    const duplicateEmailData = {
      name: 'TestUser',
      email: 'existing@example.com',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const response = await request(app)
      .post('/register')
      .send(duplicateEmailData);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Email is already in use!');
    
    // Verify only the email check was performed
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT id FROM user_form WHERE email = ?');
    expect(connection.query.mock.calls[0][1]).toEqual(['existing@example.com']);
  });

  test('should return error when username is already taken', async () => {
    // Mock database responses - email is unique but username exists
    connection.query
      .mockImplementationOnce((query, params, callback) => {
        // First call - email check (no results)
        callback(null, []);
      })
      .mockImplementationOnce((query, params, callback) => {
        // Second call - username check (username exists)
        callback(null, [{ id: 1 }]);
      });

    const duplicateUsernameData = {
      name: 'ExistingUser',
      email: 'new@example.com',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const response = await request(app)
      .post('/register')
      .send(duplicateUsernameData);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Username is already in use!');
    
    // Verify both email and username checks were performed
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT id FROM user_form WHERE email = ?');
    expect(connection.query.mock.calls[1][0]).toContain('SELECT id FROM user_form WHERE name = ?');
    expect(connection.query.mock.calls[1][1]).toEqual(['ExistingUser']);
  });

  test('should handle database error during registration', async () => {
    // Mock a database error during email check
    connection.query.mockImplementationOnce((query, params, callback) => {
      callback(new Error('Database connection error'), null);
    });

    const userData = {
      name: 'TestUser',
      email: 'test@example.com',
      password: 'Password123',
      cpassword: 'Password123',
      user_type: 'user'
    };

    const response = await request(app)
      .post('/register')
      .send(userData);

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Server error. Please try again later.');
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
}); 