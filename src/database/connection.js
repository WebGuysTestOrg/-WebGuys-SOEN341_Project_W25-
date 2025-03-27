const mysql = require("mysql2");
const config = require("../config/config");

const connection = mysql.createConnection(config.DB_CONFIG);

connection.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to MySQL");
});

module.exports = connection; 