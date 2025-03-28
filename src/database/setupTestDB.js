const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

const connection = mysql.createConnection({
    host: "127.0.0.1",  
    user: "root", // Use root instead of testuser
    password: "",  // Leave blank if root has no password
    database: "chathaven",
    multipleStatements: true 
});

// Path to schema.sql
const schemaFilePath = path.join(__dirname, "schema.sql");

// Read and execute the SQL file
const schema = fs.readFileSync(schemaFilePath, "utf8");

console.log("Setting up test database...");
connection.query(schema, (err) => {
    if (err) {
        console.error(" Database setup failed:", err);
        process.exit(1); // Exit with error
    }
    console.log(" Database setup complete.");
    connection.end(); // Close connection after setup
});
