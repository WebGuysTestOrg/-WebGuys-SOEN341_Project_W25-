const mysql = require('mysql2');
require('dotenv').config();

// Database Connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chathaven",
    port: process.env.DB_PORT || 3306
});

connection.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to MySQL");
    
    // Create user_form table first
    const createUserFormTable = `
        CREATE TABLE IF NOT EXISTS user_form (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    connection.query(createUserFormTable, (err) => {
        if (err) {
            console.error("Error creating user_form table:", err);
            return;
        }
        console.log("User form table created or already exists");
        
        // Create teams table
        const createTeamsTable = `
            CREATE TABLE IF NOT EXISTS teams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES user_form(id)
            )
        `;
        
        connection.query(createTeamsTable, (err) => {
            if (err) {
                console.error("Error creating teams table:", err);
                return;
            }
            console.log("Teams table created or already exists");
            
            // Create user_teams table
            const createUserTeamsTable = `
                CREATE TABLE IF NOT EXISTS user_teams (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    team_id INT NOT NULL,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES user_form(id),
                    FOREIGN KEY (team_id) REFERENCES teams(id),
                    UNIQUE KEY unique_user_team (user_id, team_id)
                )
            `;
            
            connection.query(createUserTeamsTable, (err) => {
                if (err) {
                    console.error("Error creating user_teams table:", err);
                    return;
                }
                console.log("User teams table created or already exists");
                
                // Create channels table
                const createChannelsTable = `
                    CREATE TABLE IF NOT EXISTS channels (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        team_id INT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (team_id) REFERENCES teams(id),
                        UNIQUE KEY unique_channel_team (name, team_id)
                    )
                `;
                
                connection.query(createChannelsTable, (err) => {
                    if (err) {
                        console.error("Error creating channels table:", err);
                        return;
                    }
                    console.log("Channels table created or already exists");
                    
                    // Create user_channels table
                    const createUserChannelsTable = `
                        CREATE TABLE IF NOT EXISTS user_channels (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            user_id INT NOT NULL,
                            channel_id INT NOT NULL,
                            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES user_form(id),
                            FOREIGN KEY (channel_id) REFERENCES channels(id),
                            UNIQUE KEY unique_user_channel (user_id, channel_id)
                        )
                    `;
                    
                    connection.query(createUserChannelsTable, (err) => {
                        if (err) {
                            console.error("Error creating user_channels table:", err);
                            return;
                        }
                        console.log("User channels table created or already exists");
                        
                        // Create direct_messages table
                        const createDirectMessagesTable = `
                            CREATE TABLE IF NOT EXISTS direct_messages (
                                id INT AUTO_INCREMENT PRIMARY KEY,
                                sender_id INT NOT NULL,
                                recipient_id INT NOT NULL,
                                message TEXT NOT NULL,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (sender_id) REFERENCES user_form(id),
                                FOREIGN KEY (recipient_id) REFERENCES user_form(id)
                            )
                        `;
                        
                        connection.query(createDirectMessagesTable, (err) => {
                            if (err) {
                                console.error("Error creating direct_messages table:", err);
                                return;
                            }
                            console.log("Direct messages table created or already exists");
                            
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
                                                is_system_message TINYINT(1) DEFAULT 0,
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
                                            
                                            // Check if is_system_message column exists in group_messages table
                                            connection.query("SHOW COLUMNS FROM group_messages LIKE 'is_system_message'", (err, results) => {
                                                if (err) {
                                                    console.error("Error checking is_system_message column:", err);
                                                } else if (results.length === 0) {
                                                    // Add is_system_message column if it doesn't exist
                                                    connection.query("ALTER TABLE group_messages ADD COLUMN is_system_message TINYINT(1) DEFAULT 0", (err) => {
                                                        if (err) {
                                                            console.error("Error adding is_system_message column:", err);
                                                        } else {
                                                            console.log("Added is_system_message column to group_messages table");
                                                        }
                                                    });
                                                }
                                            });
                                            
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
                                                    
                                                    // Remove sample/default groups
                                                    const removeDefaultGroupsQuery = `
                                                        DELETE FROM \`groups\` 
                                                        WHERE name IN ('Project Team', 'Support Group', 'Development')
                                                    `;
                                                    
                                                    connection.query(removeDefaultGroupsQuery, (err, result) => {
                                                        if (err) {
                                                            console.error("Error removing default groups:", err);
                                                        } else if (result.affectedRows > 0) {
                                                            console.log(`Removed ${result.affectedRows} default groups`);
                                                        }
                                                        
                                                        connection.end();
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}); 