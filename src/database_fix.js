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
    
    // Create groups table if it doesn't exist - using backticks because 'groups' is a reserved keyword
    const createGroupsTable = `
        CREATE TABLE IF NOT EXISTS \`groups\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES user_form(id)
        )
    `;
    
    connection.query(createGroupsTable, (err) => {
        if (err) {
            console.error("Error creating groups table:", err);
            return;
        }
        console.log("Groups table created or already exists");
        
        // Create group_members table if it doesn't exist
        const createGroupMembersTable = `
            CREATE TABLE IF NOT EXISTS group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id),
                FOREIGN KEY (user_id) REFERENCES user_form(id),
                UNIQUE KEY unique_group_member (group_id, user_id)
            )
        `;
        
        connection.query(createGroupMembersTable, (err) => {
            if (err) {
                console.error("Error creating group_members table:", err);
                return;
            }
            console.log("Group members table created or already exists");
            
            // Create group_requests table if it doesn't exist
            const createGroupRequestsTable = `
                CREATE TABLE IF NOT EXISTS group_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    group_id INT NOT NULL,
                    user_id INT NOT NULL,
                    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (group_id) REFERENCES \`groups\`(id),
                    FOREIGN KEY (user_id) REFERENCES user_form(id),
                    UNIQUE KEY unique_group_request (group_id, user_id)
                )
            `;
            
            connection.query(createGroupRequestsTable, (err) => {
                if (err) {
                    console.error("Error creating group_requests table:", err);
                    return;
                }
                console.log("Group requests table created or already exists");
                
                // Create group_messages table if it doesn't exist
                const createGroupMessagesTable = `
                    CREATE TABLE IF NOT EXISTS group_messages (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        group_id INT NOT NULL,
                        user_id INT NOT NULL,
                        text TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (group_id) REFERENCES \`groups\`(id),
                        FOREIGN KEY (user_id) REFERENCES user_form(id)
                    )
                `;
                
                connection.query(createGroupMessagesTable, (err) => {
                    if (err) {
                        console.error("Error creating group_messages table:", err);
                        return;
                    }
                    console.log("Group messages table created or already exists");
                    
                    // Check and update channels_messages table
                    const fixChannelsMessagesTable = `
                        CREATE TABLE IF NOT EXISTS channels_messages (
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
                    
                    connection.query(fixChannelsMessagesTable, (err) => {
                        if (err) {
                            console.error("Error fixing channels_messages table:", err);
                            return;
                        }
                        console.log("Channels messages table fixed or created");
                        
                        // Check and update global_messages table
                        const fixGlobalMessagesTable = `
                            CREATE TABLE IF NOT EXISTS global_messages (
                                id INT PRIMARY KEY AUTO_INCREMENT,
                                sender_id INT NOT NULL,
                                sender_name VARCHAR(255) NOT NULL,
                                message TEXT NOT NULL,
                                quoted_text TEXT,
                                quoted_sender VARCHAR(255),
                                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (sender_id) REFERENCES user_form(id)
                            )
                        `;
                        
                        connection.query(fixGlobalMessagesTable, (err) => {
                            if (err) {
                                console.error("Error fixing global_messages table:", err);
                                return;
                            }
                            console.log("Global messages table fixed or created");
                            
                            console.log("Database repair completed successfully!");
                            
                            // Add sample data to groups table for testing
                            connection.query("SELECT COUNT(*) as count FROM `groups`", (err, results) => {
                                if (err) {
                                    console.error("Error checking groups count:", err);
                                    connection.end();
                                    return;
                                }
                                
                                // If no groups exist, add sample data
                                if (results[0].count === 0) {
                                    console.log("Adding sample groups data...");
                                    
                                    // Get an admin user to be the creator
                                    connection.query("SELECT id FROM user_form WHERE user_type = 'admin' LIMIT 1", (err, users) => {
                                        if (err || users.length === 0) {
                                            console.error("Error finding admin user or no admin exists:", err);
                                            connection.end();
                                            return;
                                        }
                                        
                                        const adminId = users[0].id;
                                        
                                        // Sample groups data
                                        const sampleGroups = [
                                            ["Project Team", "Team working on the main project", adminId],
                                            ["Support Group", "Group for technical support discussions", adminId],
                                            ["Development", "Software development discussion", adminId]
                                        ];
                                        
                                        // Insert sample groups
                                        const insertGroupsQuery = `
                                            INSERT INTO \`groups\` (name, description, created_by)
                                            VALUES ?
                                        `;
                                        
                                        connection.query(insertGroupsQuery, [sampleGroups], (err) => {
                                            if (err) {
                                                console.error("Error inserting sample groups:", err);
                                            } else {
                                                console.log("Sample groups added successfully");
                                            }
                                            connection.end();
                                        });
                                    });
                                } else {
                                    connection.end();
                                }
                            });
                        });
                    });
                });
            });
        });
    });
}); 