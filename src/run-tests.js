const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

console.log('All tests completed!');

// Exit with error code if any tests failed
if (testsHaveFailed) {
  console.error('One or more test suites failed!');
  process.exit(1);
} 