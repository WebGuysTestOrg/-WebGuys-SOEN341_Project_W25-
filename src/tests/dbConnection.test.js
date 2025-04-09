const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Mock connection object
const mockConnection = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn()
};

// Mock the mysql2 library
jest.mock('mysql2', () => ({
  createConnection: jest.fn().mockReturnValue(mockConnection)
}));

// Mock the fs module
jest.mock('fs', () => ({
  readFile: jest.fn(),
  access: jest.fn(),
  constants: { F_OK: 1 }
}));

// Clear cache for db module to ensure fresh require for each test
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  
  // Setup default mock implementations
  mockConnection.connect.mockImplementation(callback => callback(null));
  mockConnection.query.mockImplementation((query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    callback(null, []);
  });
});

// Mock console and process
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalProcessExit = process.exit;

describe('Database Connection Module', () => {
  let mockExit;
  
  beforeEach(() => {
    // Clear all mocks again for clarity
    jest.clearAllMocks();
    
    // Mock process.exit
    mockExit = jest.fn();
    process.exit = mockExit;
    
    // Silent console output during tests
    console.error = jest.fn();
    console.log = jest.fn();
    
    // Default setup for database queries
    mockConnection.query
      .mockImplementationOnce((query, callback) => {
        // SHOW DATABASES query
        callback(null, []); 
      })
      .mockImplementationOnce((query, callback) => {
        // CREATE DATABASE query
        callback(null);
      })
      .mockImplementationOnce((query, callback) => {
        // USE database query
        callback(null);
      });
      
    // Default for fs.access - schema doesn't exist
    fs.access.mockImplementation((path, mode, callback) => {
      callback(new Error('File not found'));
    });
  });
  
  afterEach(() => {
    // Restore original functions
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    process.exit = originalProcessExit;
  });
  
  test('should create a connection with default parameters when environment variables are not set', () => {
    // Delete any environment variables
    delete process.env.DB_HOST;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    
    // Import the db module
    require('../config/db');
    
    // Verify connection was created with default parameters
    expect(mysql.createConnection).toHaveBeenCalledWith({
      host: "localhost",
      user: "root",
      password: "",
      multipleStatements: true
    });
  });
  
  test('should create a connection with environment variables when they are set', () => {
    // Set environment variables
    process.env.DB_HOST = 'test-host';
    process.env.DB_USER = 'test-user';
    process.env.DB_PASSWORD = 'test-password';
    
    // Import the db module
    require('../config/db');
    
    // Verify connection was created with environment variables
    expect(mysql.createConnection).toHaveBeenCalledWith({
      host: 'test-host',
      user: 'test-user',
      password: 'test-password',
      multipleStatements: true
    });
    
    // Clean up environment
    delete process.env.DB_HOST;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
  });
  
  test('should exit process when initial connection fails', () => {
    // Make connect fail
    mockConnection.connect.mockImplementationOnce((callback) => {
      callback(new Error('Connection failed'));
    });
    
    // Import the db module
    require('../config/db');
    
    // Verify error was logged and process exit was called
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Initial database connection failed'),
      expect.any(Error)
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  test('should check if database exists and create it if not found', () => {
    // Setup mock implementations
    mockConnection.connect.mockImplementationOnce((callback) => {
      callback(null); // Successful connection
    });
    
    // First query (check if database exists) returns empty results
    mockConnection.query
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('SHOW DATABASES LIKE');
        callback(null, []); // No results - database doesn't exist
      })
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('CREATE DATABASE');
        callback(null); // Success
      })
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('USE chathaven');
        callback(null); // Success
      });
    
    // Import the db module
    require('../config/db');
    
    // Verify queries were made in the right order
    expect(mockConnection.query).toHaveBeenCalledTimes(3);
    expect(mockConnection.query.mock.calls[0][0]).toContain('SHOW DATABASES');
    expect(mockConnection.query.mock.calls[1][0]).toContain('CREATE DATABASE');
    expect(mockConnection.query.mock.calls[2][0]).toContain('USE chathaven');
    
    // Verify logs
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Database'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('created successfully'));
  });
  
  test('should use existing database if it already exists', () => {
    // Setup mock implementations
    mockConnection.connect.mockImplementationOnce((callback) => {
      callback(null); // Successful connection
    });
    
    // Database exists query returns results
    mockConnection.query
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('SHOW DATABASES LIKE');
        callback(null, [{ 'chathaven': 'chathaven' }]); // Database exists
      })
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('USE chathaven');
        callback(null); // Success
      });
    
    // Import the db module
    require('../config/db');
    
    // Verify queries were made in the right order
    expect(mockConnection.query).toHaveBeenCalledTimes(2);
    expect(mockConnection.query.mock.calls[0][0]).toContain('SHOW DATABASES');
    expect(mockConnection.query.mock.calls[1][0]).toContain('USE chathaven');
    
    // Verify logs
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });
  
  test('should execute schema.sql if it exists', () => {
    // Setup mock implementations
    mockConnection.connect.mockImplementationOnce((callback) => {
      callback(null); // Successful connection
    });
    
    // First query returns results (database exists)
    mockConnection.query
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('SHOW DATABASES LIKE');
        callback(null, [{ 'chathaven': 'chathaven' }]); // Database exists
      })
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('USE chathaven');
        callback(null); // Success
      });
    
    // Mock fs.access to make schema.sql exist
    fs.access.mockImplementationOnce((path, mode, callback) => {
      callback(null); // File exists
    });
    
    // Mock fs.readFile to return schema content
    fs.readFile.mockImplementationOnce((path, encoding, callback) => {
      callback(null, 'CREATE TABLE test (id INT);CREATE TABLE test2 (id INT);');
    });
    
    // Mock the schema execution queries
    mockConnection.query
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('CREATE TABLE test');
        callback(null);
      })
      .mockImplementationOnce((query, callback) => {
        expect(query).toContain('CREATE TABLE test2');
        callback(null);
      });
    
    // Import the db module
    require('../config/db');
    
    // Verify fs was called to read the schema
    expect(fs.readFile).toHaveBeenCalled();
    
    // Verify the SQL statements were executed (total calls: 4)
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE test'),
      expect.any(Function)
    );
  });
}); 