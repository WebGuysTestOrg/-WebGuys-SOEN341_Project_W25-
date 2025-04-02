const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mysql = require('mysql2');

// Directory containing test files
const testDir = path.join(__dirname, 'tests');

// Read all test files
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js') && !file.includes('BasicTest'));

console.log('Running tests sequentially:');
let testResults = '';
let testsHaveFailed = false;

// Run each test file one at a time
testFiles.forEach(file => {
  const testPath = `tests/${file}`; // Use forward slashes for consistency
  console.log(`\n\n======== Running ${file} ========`);
  
  try {
    // Run Jest directly with the test file
    const output = execSync(
      `node node_modules/jest/bin/jest.js "${testPath}" --detectOpenHandles --forceExit`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    console.log(output);
    testResults += output;
    console.log(`\n======== Completed ${file} ========\n`);
  } catch (error) {
    console.error(`Test ${file} failed with error: ${error.message}`);
    if (error.stdout) {
      console.log(error.stdout);
      testResults += error.stdout;
    }
    console.log(`\n======== Failed ${file} ========\n`);
    testsHaveFailed = true;
  }
  
  // Small delay between tests to ensure resources are freed
  console.log("Waiting 3 seconds before next test...");
  
  // Cross-platform sleep by just waiting in JavaScript
  const waitTime = Date.now() + 3000;
  while (Date.now() < waitTime) {
    // Busy wait
  }
});

// Write test results to a file for CI/CD checking
fs.writeFileSync(path.join(__dirname, 'test-results.log'), testResults);

// Function to clean up test data
function cleanupTestData() {
  console.log('\n======== Starting Database Cleanup ========');
  
  return new Promise((resolve, reject) => {
    // Create a connection with a shorter timeout
    const cleanup_connection = mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'chathaven',
      connectTimeout: 5000, // 5 second timeout
    });
    
    // Set a timeout for the entire cleanup operation
    const timeoutId = setTimeout(() => {
      console.log('Database cleanup timed out - continuing with program execution');
      try {
        cleanup_connection.end();
      } catch (err) {
        // Ignore errors when ending connection
      }
      resolve();
    }, 10000); // 10 second timeout for entire operation
    
    cleanup_connection.connect((err) => {
      if (err) {
        console.error('Failed to connect to database for cleanup:', err);
        clearTimeout(timeoutId);
        return resolve(); // Continue even if connection fails
      }
      
      console.log('Connected to database for cleanup');
      
      // Clean up in the correct order to respect foreign key constraints
      const cleanup = async () => {
        try {
          // 1. First delete group-related messages and requests
          await executeQuery(cleanup_connection, 'DELETE FROM group_messages WHERE 1=1');
          await executeQuery(cleanup_connection, 'DELETE FROM group_requests WHERE 1=1');
          
          // 2. Delete group members
          await executeQuery(cleanup_connection, 'DELETE FROM group_members WHERE 1=1');
          
          // 3. Delete groups
          await executeQuery(cleanup_connection, 'DELETE FROM `groups` WHERE 1=1');
          
          // 4. Delete channel messages
          await executeQuery(cleanup_connection, 'DELETE FROM channels_messages WHERE team_name LIKE "team_%" OR channel_name LIKE "channel_%"');
          
          // 5. Delete global messages created during tests
          await executeQuery(cleanup_connection, 'DELETE FROM global_messages WHERE sender_name LIKE "%test%" OR sender_name LIKE "%Test%" OR sender_name LIKE "%Admin%" OR sender_name LIKE "%User%"');
          
          // 6. Delete direct messages
          await executeQuery(cleanup_connection, 'DELETE FROM direct_messages WHERE sender_id IN (SELECT id FROM user_form WHERE email LIKE "%test%" OR email LIKE "%example%")');
          
          // 7. Delete user_channels junction records
          await executeQuery(cleanup_connection, 'DELETE FROM user_channels WHERE user_id IN (SELECT id FROM user_form WHERE email LIKE "%test%" OR email LIKE "%example%")');
          
          // 8. Delete user_teams junction records
          await executeQuery(cleanup_connection, 'DELETE FROM user_teams WHERE user_id IN (SELECT id FROM user_form WHERE email LIKE "%test%" OR email LIKE "%example%")');
          
          // 9. Delete channels
          await executeQuery(cleanup_connection, 'DELETE FROM channels WHERE name LIKE "channel_%" AND team_id IN (SELECT id FROM teams WHERE name LIKE "team_%")');
          
          // 10. Delete teams
          await executeQuery(cleanup_connection, 'DELETE FROM teams WHERE name LIKE "team_%"');
          
          // 11. Delete user activity logs
          await executeQuery(cleanup_connection, 'DELETE FROM user_activity_log WHERE name LIKE "%Test%" OR name LIKE "%Admin%" OR name LIKE "%User%"');
          
          // 12. Finally delete test users
          await executeQuery(cleanup_connection, 'DELETE FROM user_form WHERE email LIKE "%test%" OR email LIKE "%example%"');
          
          console.log('Completed database cleanup');
        } catch (err) {
          console.error('Error during cleanup:', err);
        }
      };
      
      cleanup()
        .then(() => {
          clearTimeout(timeoutId);
          try {
            cleanup_connection.end();
          } catch (err) {
            // Ignore errors when ending connection
          }
          resolve();
        })
        .catch(err => {
          clearTimeout(timeoutId);
          console.error('Error in cleanup process:', err);
          try {
            cleanup_connection.end();
          } catch (err) {
            // Ignore errors when ending connection
          }
          resolve(); // Continue despite errors
        });
    });
  });
}

// Helper function to execute a query and return a promise
function executeQuery(conn, sql, params = []) {
  return new Promise((resolve, reject) => {
    // Set timeout for individual query
    const queryTimeout = setTimeout(() => {
      console.log(`Query timed out: ${sql}`);
      resolve(); // Continue to next query
    }, 3000); // 3 second timeout per query
    
    conn.query(sql, params, (err, results) => {
      clearTimeout(queryTimeout);
      if (err) {
        console.error(`Error executing query: ${sql}`, err);
        // Don't reject - continue with other queries
        return resolve();
      }
      console.log(`Successfully executed: ${sql} (${results.affectedRows} rows affected)`);
      resolve(results);
    });
  });
}

// Run cleanup and then exit process
cleanupTestData().then(() => {
  console.log('\nAll tests completed and database cleaned up!');
  
  // Exit with error code if any tests failed
  if (testsHaveFailed) {
    console.error('One or more test suites failed!');
    process.exit(1);
  }
}).catch(err => {
  console.error('Cleanup failed:', err);
  
  // Exit with error code if any tests failed
  if (testsHaveFailed) {
    process.exit(1);
  }
}); 