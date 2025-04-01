const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Directory containing test files
const testDir = path.join(__dirname, 'tests');

// Read all test files
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js') && !file.includes('BasicTest'));

console.log('Running tests sequentially:');

// Run each test file one at a time
testFiles.forEach(file => {
  const testPath = `tests/${file}`; // Use forward slashes for consistency
  console.log(`\n\n======== Running ${file} ========`);
  
  try {
    // Run Jest directly with the test file
    execSync(
      `node node_modules/jest/bin/jest.js "${testPath}" --detectOpenHandles --forceExit`,
      { stdio: 'inherit' }
    );
    console.log(`\n======== Completed ${file} ========\n`);
  } catch (error) {
    console.error(`Test ${file} failed with error: ${error.message}`);
    console.log(`\n======== Failed ${file} ========\n`);
  }
  
  // Small delay between tests to ensure resources are freed
  console.log("Waiting before next test...");
  try {
    // Handle Windows-specific pause command
    execSync('timeout /t 3', { stdio: 'inherit' });
  } catch (e) {
    // Simple fallback if timeout command fails
    console.log("Waiting 3 seconds...");
    execSync('ping 127.0.0.1 -n 4 > nul', { stdio: 'ignore' });
  }
});

console.log('All tests completed!'); 