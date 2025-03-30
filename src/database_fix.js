const mysql = require('mysql2');

// Database Connection
const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "WebGuys2025!",
    database: "chathaven",
});

connection.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to MySQL");
    
    // Drop the existing table if needed
    connection.query("DROP TABLE IF EXISTS channels_messages", (err) => {
        if (err) {
            console.error("Error dropping table:", err);
            process.exit(1);
        }
        console.log("Dropped channels_messages table if it existed");
        
        // Create the table with the correct structure
        const createTableQuery = `
            CREATE TABLE channels_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL,
                channel_name VARCHAR(255) NOT NULL,
                sender VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                quoted_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (team_name, channel_name)
            )
        `;
        
        connection.query(createTableQuery, (err) => {
            if (err) {
                console.error("Error creating table:", err);
                process.exit(1);
            }
            console.log("Created channels_messages table with correct structure");
            
            // Insert sample data
            const sampleData = [];
            
            // Sample conversation messages
            const conversations = [
                {
                    sender: 'Admin',
                    text: 'Welcome to the channel! This is where we discuss project updates.',
                    quoted: null
                },
                {
                    sender: 'ChatBot',
                    text: 'This channel is now active. You can start chatting!',
                    quoted: null
                },
                {
                    sender: 'User1',
                    text: 'Hi everyone! Excited to be part of this team.',
                    quoted: null
                },
                {
                    sender: 'User2',
                    text: 'Welcome aboard! Let me know if you have any questions.',
                    quoted: 'Hi everyone! Excited to be part of this team.'
                }
            ];
            
            // Teams and channels from the image
            const teams = ['1211'];
            const channels = ['general', '123', '122133', 'general2', '1212', '321', '123123', '23312', 'dasd'];
            
            teams.forEach(team => {
                channels.forEach(channel => {
                    conversations.forEach(msg => {
                        sampleData.push([
                            team, 
                            channel, 
                            msg.sender,
                            msg.text,
                            msg.quoted
                        ]);
                    });
                });
            });
            
            // Insert all sample data
            const insertQuery = `
                INSERT INTO channels_messages 
                (team_name, channel_name, sender, text, quoted_message)
                VALUES ?
            `;
            
            connection.query(insertQuery, [sampleData], (err) => {
                if (err) {
                    console.error("Error inserting sample data:", err);
                    process.exit(1);
                }
                console.log("Inserted sample data into channels_messages");
                console.log("Database fix completed successfully!");
                
                // Close the connection
                connection.end();
            });
        });
    });
}); 