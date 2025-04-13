const mysql = require("mysql2");
const fs = require('fs'); // Needed for reading SQL file
const path = require('path'); // Needed for path joining



// Function to execute SQL script (will be used if schema.sql exists)
function executeSqlScript(connection, filePath, callback) {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return callback(err);
        }
        // Split statements based on semicolon, filtering out empty ones
        const statements = data.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        let executedCount = 0;
        statements.forEach(statement => {
            connection.query(statement, (err, results) => {
                if (err) {
                    // Log error but continue if possible, maybe some statements are optional
                    console.error(`Error executing statement: ${statement}`, err);
                }
                executedCount++;
                // Check if all statements have been processed
                if (executedCount === statements.length) {
                    callback(null); // Signal completion
                }
            });
        });
    });
}


// Original database connection setup
const connection = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    // Allow multiple statements for script execution
    multipleStatements: true 
});

// Create a connection pool for promise API usage
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "chathaven",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Connect and setup database
connection.connect((err) => {
    if (err) {
        console.error("Initial database connection failed:", err);
        process.exit(1); // Exit if initial connection fails
    }
    console.log("Initial MySQL connection successful. Checking/creating database...");

    // Check if database exists
    connection.query("SHOW DATABASES LIKE 'chathaven'", (err, results) => {
        if (err) {
            console.error("Error checking database existence:", err);
            connection.end(); // Close connection on critical error
            process.exit(1);
        }

        if (results.length === 0) {
            // Database doesn't exist, create it
            console.log("Database 'chathaven' not found. Creating...");
            connection.query("CREATE DATABASE chathaven", (err) => {
                if (err) {
                    console.error("Error creating database 'chathaven':", err);
                    connection.end();
                    process.exit(1);
                }
                console.log("Database 'chathaven' created successfully.");
                useDatabaseAndSetupTables();
            });
        } else {
            console.log("Database 'chathaven' already exists.");
            useDatabaseAndSetupTables();
        }
    });
});

function useDatabaseAndSetupTables() {
    // Use the chathaven database
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error switching to database 'chathaven':", err);
            connection.end();
            process.exit(1);
        }
        console.log("Using database 'chathaven'. Setting up tables...");

        // Define path to schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql'); 

        // Check if schema.sql exists
        fs.access(schemaPath, fs.constants.F_OK, (err) => {
            if (err) {
                // schema.sql does not exist or is not accessible
                console.log("schema.sql not found. Proceeding with hardcoded table setup (backward compatibility)...");
                setupTablesHardcoded(); // Fallback to original hardcoded setup
            } else {
                // schema.sql exists, execute it
                console.log("schema.sql found. Executing script...");
                executeSqlScript(connection, schemaPath, (err) => {
                    if (err) {
                        console.error("Error executing schema.sql:", err);
                        // Decide if we should exit or try hardcoded setup as fallback
                         console.log("Falling back to hardcoded table setup due to schema.sql execution error...");
                         setupTablesHardcoded(); // Optional: fallback even on script error
                        // OR: connection.end(); process.exit(1); // Exit on schema error
                    } else {
                        console.log("schema.sql executed successfully. Database tables ready.");
                        // Optional: Add any post-schema execution checks if needed
                        // preloadChannelMessages(); // Assuming this function exists and needs to be called
                    }
                });
            }
        });
    });
}


// Original hardcoded table setup (kept for fallback or if schema.sql is not preferred)
function setupTablesHardcoded() {
    console.log("Executing hardcoded table setup...");
    // Create or update channels_messages table (Example, include all original table setups here)
    const createChannelsMessagesTable = `
        CREATE TABLE IF NOT EXISTS channels_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            team_name VARCHAR(255) NOT NULL,
            channel_name VARCHAR(255) NOT NULL,
            sender VARCHAR(255) NOT NULL, -- Changed from sender_name if needed
            text TEXT NOT NULL,
            quoted_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (team_name, channel_name)
        )
    `;

    connection.query(createChannelsMessagesTable, (err) => {
        if (err) {
            console.error("Error creating channels_messages table (hardcoded):", err);
            // Decide whether to proceed or exit
            return; 
        }
        console.log("Channels messages table (hardcoded) ready.");

        // Add other table creation/alteration logic from original setupDatabase here...
        // Example: Check and rename sender_name column if necessary
         checkAndHandleSenderColumn();
         // Create other tables like global_messages, users, teams etc.
        // createGlobalMessagesTable(); 
        // createUserFormTable();
        // ... etc.

        // After all tables are set up (or checked/altered):
        // preloadChannelMessages(); // Assuming this needs to run after setup
    });
}

// Example: Function to handle the sender column check/rename
function checkAndHandleSenderColumn() {
    connection.query("SHOW COLUMNS FROM channels_messages LIKE 'sender'", (err, results) => {
        if (err) {
            console.error("Error checking 'sender' column:", err);
            return;
        }
        if (results.length === 0) { // 'sender' column doesn't exist
            connection.query("SHOW COLUMNS FROM channels_messages LIKE 'sender_name'", (err, results_name) => {
                 if (err) {
                    console.error("Error checking 'sender_name' column:", err);
                    return;
                 }
                 if (results_name.length > 0) { // 'sender_name' exists
                    connection.query("ALTER TABLE channels_messages CHANGE sender_name sender VARCHAR(255) NOT NULL", (err) => {
                        if (err) {
                            console.error("Error renaming sender_name to sender:", err);
                        } else {
                            console.log("Renamed sender_name to sender for backward compatibility.");
                        }
                        // Potentially call next setup step or preload here
                    });
                 } else { // Neither 'sender' nor 'sender_name' exists
                    connection.query("ALTER TABLE channels_messages ADD COLUMN sender VARCHAR(255) NOT NULL AFTER channel_name", (err) => {
                        if (err) {
                             console.error("Error adding sender column:", err);
                        } else {
                            console.log("Added sender column to channels_messages table.");
                        }
                        // Potentially call next setup step or preload here
                    });
                 }
            });
        } else {
            console.log("'sender' column already exists in channels_messages.");
             // Potentially call next setup step or preload here
        }
    });
}

// IMPORTANT: Include definitions or require statements for functions like 
// preloadChannelMessages if they are called within the setup process and defined elsewhere.
// If preloadChannelMessages was defined in server.js and relied on `connection`, 
// it might need to be moved here or passed the connection object.

// Export the connection object with promise method
connection.promise = () => {
    return pool.promise();
};

// Export the connection object
module.exports = {connection, pool}; 