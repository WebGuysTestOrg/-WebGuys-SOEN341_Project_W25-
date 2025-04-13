const util = require('util');

// Create mock functions
const mockQuery = jest.fn();
const mockPromisifiedQuery = jest.fn();
const mockBeginTransaction = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();

// Create mock pool
const pool = {
  query: mockQuery,
};

// Add promisify function to the pool
pool.query[util.promisify.custom] = mockPromisifiedQuery;

// Create mock connection
const connection = {
  query: mockQuery,
  beginTransaction: mockBeginTransaction,
  commit: mockCommit,
  rollback: mockRollback,
  promise: () => {
    return {
      query: mockPromisifiedQuery,
    };
  }
};

// Reset all mocks before each test
const resetMocks = () => {
  mockQuery.mockReset();
  mockPromisifiedQuery.mockReset();
  mockBeginTransaction.mockReset();
  mockCommit.mockReset();
  mockRollback.mockReset();

  // Set default implementations
  mockBeginTransaction.mockImplementation(callback => callback(null));
  mockCommit.mockImplementation(callback => callback(null));
  mockRollback.mockImplementation(callback => callback(null));
  
  // Create sensible default implementation for query that works for most cases
  mockQuery.mockImplementation((query, params, callback) => {
    // Handle case where params is actually the callback (no params provided)
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // Default to empty array result for most queries
    callback(null, []);
  });
  
  // Default implementation for promisified query
  mockPromisifiedQuery.mockImplementation(() => {
    return Promise.resolve([]);
  });
};

module.exports = {
  pool,
  connection,
  mockQuery,
  mockPromisifiedQuery,
  mockBeginTransaction,
  mockCommit,
  mockRollback,
  resetMocks,
}; 