const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const session = require("express-session");
const path = require("path");
const sharedSession = require("express-socket.io-session"); 
const {Server} =require("socket.io") 



const app = express();

const PORT= process.env.PORT|| 3000
const expressServer=app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const sessionMiddleware= 
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 3600000 },
    });

app.use(sessionMiddleware)
app.use(express.static(path.join(__dirname, "public")));

const onlineUsers = new Map();
const awayUsers = new Map();
const INACTIVITY_TIME = 30000; 
const io= new Server(expressServer,{
    cors:{
        origin:process.env.NODE_ENV==="production"? false :["http://localhost:3000","http://127.0.0.1:3000"]
    }
})
io.use(sharedSession(sessionMiddleware, {
    autoSave: true,  // Automatically save session on socket events
}));

io.on('connection',socket =>{
    const session = socket.handshake.session;

    if (session && session.user && session.user.name) {
        console.log(`User ${session.user.name} connected`);
    } else {
        console.log(`User with no session connected`);
    }
    
    socket.on('message',data=>{
        const message = data.text;
         
        const user = session.user && session.user.name ? `${session.user.name}[${session.user.user_type}_${session.user.id.toString().padStart(3, '0')}]`:"Anonymous"; 
        io.emit('message',{SSocketId:socket.id,user:user,text:message, userID:session.user.id})
    })
    let inactivityTimer;
    socket.on("userOnline", (userId) => {
        onlineUsers.set(userId, socket.id);
        awayUsers.delete(userId);
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });

        resetInactivityTimer(userId);
    });
    socket.on("userAway", (userId) => {
        awayUsers.set(userId, socket.id);
        console.log(userId)
        onlineUsers.delete(userId);
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
        
    });
    socket.on("disconnect", (reason) => {
        console.log(`User ${socket.id} disconnected`);

        onlineUsers.forEach((socketId, userId) => {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                awayUsers.delete(userId);
            }
        });
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });
    function startInactivityTimer(userId) {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            console.log(`User ${userId} is now away`);
            socket.emit("userAway", userId);
        }, INACTIVITY_TIME);
    }

    function resetInactivityTimer(userId) {
        clearTimeout(inactivityTimer);
        startInactivityTimer(userId);
        console.log(`User ${userId} is now online`);
    }
})



// Database Connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chathaven",
});

connection.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to MySQL");
});


io.on("connection", (socket) => {
    socket.on("private-message", (msg) => {
        const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text) VALUES (?, ?, ?)";
        connection.query(insertQuery, [msg.senderId, msg.recipientId, msg.text], (err) => {
            if (err) {
                console.error("Error saving message:", err);
                return;
            }
            io.emit("private-message", msg);
        });
    });
});


app.get('/get-user-chats', (req, res) => {
    const { userId } = req.query;
    const query = `
        SELECT DISTINCT uf.id AS user_id, uf.name AS username
        FROM direct_messages dm
        JOIN user_form uf ON (dm.sender_id = uf.id OR dm.recipient_id = uf.id)
        WHERE (dm.sender_id = ? OR dm.recipient_id = ?) AND uf.id != ?
    `;

    connection.query(query, [userId, userId, userId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error fetching chats." });
        }
        res.json(results);
    });
});



app.get('/get-messages', (req, res) => {
    const { senderId, recipientId } = req.query;
    
    const query = `
        SELECT dm.text, dm.sender_id, dm.recipient_id, uf.name AS senderName
        FROM direct_messages dm
        JOIN user_form uf ON dm.sender_id = uf.id
        WHERE (dm.sender_id = ? AND dm.recipient_id = ?)
           OR (dm.sender_id = ? AND dm.recipient_id = ?)
        ORDER BY dm.timestamp
    `;

    connection.query(query, [senderId, recipientId, recipientId, senderId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Error fetching messages." });
        }
        res.json(results);
    });
});



app.get("/get-user-id", (req, res) => {
    const { username } = req.query;
    const query = "SELECT id FROM user_form WHERE name = ?";
    connection.query(query, [username], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (results.length === 0) return res.status(404).json({ error: "User not found." });
        res.json({ userId: results[0].id });
    });
});


// User Registration
app.post("/register", (req, res) => {
    const { name, email, password, cpassword, user_type } = req.body;

    if (password !== cpassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

   
    const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
    connection.query(checkEmailQuery, [email], (err, emailResults) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (emailResults.length > 0) {
            return res.status(400).json({ error: "Email is already in use!" });
        }

        
        const checkUsernameQuery = "SELECT id FROM user_form WHERE name = ?";
        connection.query(checkUsernameQuery, [name], (err, nameResults) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Server error. Please try again later." });
            }

            if (nameResults.length > 0) {
                return res.status(400).json({ error: "Username is already in use!" });
            }

            
            const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
            const insertQuery = "INSERT INTO user_form (name, email, password, user_type) VALUES (?, ?, ?, ?)";

            connection.query(insertQuery, [name, email, hashedPassword, user_type], (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: "Error registering user." });
                }
                res.status(200).json({ redirect: "/login_form.html" });
            });
        });
    });
});




app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
    const query = "SELECT * FROM user_form WHERE email = ? AND password = ?";

    connection.query(query, [email, hashedPassword], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (results.length > 0) {
            const user = results[0];
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
            };

            if (user.user_type === "admin") {
                return res.json({ redirect: "/admin_page.html" });
            } else {
                return res.json({ redirect: "/user_page.html" });
            }
        } else {
            res.status(401).json({ error: "Invalid email or password." });
        }
    });
});


app.get("/user-info", (req, res) => {

    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ 
        name: req.session.user.name, 
        email: req.session.user.email, 
        id: req.session.user.id,
        role: req.session.user.user_type
    });
    
});

app.get("/admin-info", (req, res) => {
    if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name });
});


app.post("/create-team", (req, res) => {
    if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(403).json({ error: "Only Super Admin can create teams." });
    }

    const { teamName } = req.body;
    const createdBy = req.session.user.id;

    if (!teamName) {
        return res.status(400).json({ error: "Team name is required." });
    }

    const insertTeamQuery = "INSERT INTO teams (name, created_by) VALUES (?, ?)";

    connection.query(insertTeamQuery, [teamName, createdBy], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Team name already exists!" });
            }
            console.error(err);
            return res.status(500).json({ error: "Error creating team." });
        }

        const teamId = result.insertId;

        const insertUserTeamQuery = "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)";
        connection.query(insertUserTeamQuery, [createdBy, teamId], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Error adding creator to team." });
            }
            res.json({ message: "Team created successfully!", teamName });
        });
    });
});





app.get("/get-team-id", (req, res) => {
    const { teamName } = req.query;
    if (!teamName) return res.status(400).json({ error: "Team name is required." });

    const query = "SELECT id FROM teams WHERE name = ?";
    connection.query(query, [teamName], (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching team ID." });
        if (results.length === 0) return res.status(404).json({ error: "Team not found." });
        res.json({ teamId: results[0].id });
    });
});

app.post("/create-channel", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const { channelName, teamId } = req.body;
    const userId = req.session.user.id;

    if (!channelName || !teamId) {
        return res.status(400).json({ error: "Channel Name and Team ID are required." });
    }

    // Verify if the user is either the team creator or a team member
    const checkMembershipQuery = `
        SELECT t.created_by AS creatorId, ut.user_id 
        FROM teams t
        LEFT JOIN user_teams ut ON t.id = ut.team_id
        WHERE t.id = ? AND (t.created_by = ? OR ut.user_id = ?)`;

    connection.query(checkMembershipQuery, [teamId, userId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error while verifying team membership." });
        if (results.length === 0) return res.status(403).json({ error: "You must be the creator or a member of the team to create a channel." });

        const teamCreatorId = results[0].creatorId;

        // Insert the new channel
        const insertChannelQuery = "INSERT INTO channels (name, team_id) VALUES (?, ?)";
        connection.query(insertChannelQuery, [channelName, teamId], (err, channelResult) => {
            if (err) return res.status(500).json({ error: "Channel name already exists!" });

            const channelId = channelResult.insertId;

            // Insert the user who created the channel
            const insertUserChannelQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";
            connection.query(insertUserChannelQuery, [userId, channelId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding creator to channel." });

                // If the team creator is not the same as the channel creator, add them to the channel
                if (teamCreatorId !== userId) {
                    connection.query(insertUserChannelQuery, [teamCreatorId, channelId], (err) => {
                        if (err) return res.status(500).json({ error: "Error adding team creator to channel." });

                        res.json({ message: "Channel created successfully. Team creator and channel creator added." });
                    });
                } else {
                    res.json({ message: "Channel created successfully. Creator added automatically." });
                }
            });
        });
    });
});


app.post('/assign-user-to-team', (req, res) => {
    const { teamId, userName } = req.body;

    if (!teamId || !userName) {
        return res.status(400).json({ error: "Team ID and User Name are required." });
    }

    const checkTeamQuery = "SELECT * FROM teams WHERE id = ?";
    connection.query(checkTeamQuery, [teamId], (err, teamResults) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (teamResults.length === 0) return res.status(400).json({ error: "Team not found." });

        
        const checkUserQuery = "SELECT id FROM user_form WHERE name = ?";
        connection.query(checkUserQuery, [userName], (err, userResults) => {
            if (err) return res.status(500).json({ error: "Database error." });
            if (userResults.length === 0) return res.status(400).json({ error: "User not found." });

            const userId = userResults[0].id;

           
            const checkUserInTeamQuery = "SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?";
            connection.query(checkUserInTeamQuery, [userId, teamId], (err, existingResults) => {
                if (err) return res.status(500).json({ error: "Database error." });
                if (existingResults.length > 0) return res.status(400).json({ error: "User already assigned to this team." });

               
                const assignUserQuery = "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)";
                connection.query(assignUserQuery, [userId, teamId], (err) => {
                    if (err) return res.status(500).json({ error: "Error assigning user to team." });
                    res.json({ message: "User successfully assigned to the team." });
                });
            });
        });
    });
});




app.post("/assign-user", (req, res) => {
    const { teamId, channelName, userName } = req.body;

    if (!teamId || !channelName || !userName) {
        return res.status(400).json({ error: "Missing fields." });
    }

    const getUserIdQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(getUserIdQuery, [userName], (err, userResults) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (userResults.length === 0) return res.status(404).json({ error: "User not found." });

        const userId = userResults[0].id;

        const checkTeamQuery = "SELECT id FROM teams WHERE id = ?";
        connection.query(checkTeamQuery, [teamId], (err, teamResults) => {
            if (err) return res.status(500).json({ error: "Database error." });
            if (teamResults.length === 0) return res.status(404).json({ error: "Team not found." });

            const checkUserQuery = "SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?";
            connection.query(checkUserQuery, [userId, teamId], (err, userResults) => {
                if (err) return res.status(500).json({ error: "Database error." });
                if (userResults.length === 0) return res.status(403).json({ error: "User is not in this team." });

                const channelQuery = "SELECT id FROM channels WHERE name = ? AND team_id = ?";
                connection.query(channelQuery, [channelName, teamId], (err, channelResults) => {
                    if (err) return res.status(500).json({ error: "Database error." });
                    if (channelResults.length === 0) return res.status(404).json({ error: "Channel not found in this team." });

                    const channelId = channelResults[0].id;

                    const assignQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";
                    connection.query(assignQuery, [userId, channelId], (err) => {
                        if (err) return res.status(500).json({ error: "Error assigning user to channel." });
                        res.json({ message: "User assigned to channel successfully!" });
                    });
                });
            });
        });
    });
});


app.get("/get-teams-with-members", (req, res) => {
    const query = `
        SELECT 
            t.id AS teamId,
            t.name AS teamName,
            u.name AS creatorName,
            m.name AS memberName,
            c.id AS channelId,
            c.name AS channelName,
            uc.user_id AS channelUserId,
            cu.name AS channelUserName
        FROM teams t
        LEFT JOIN user_teams ut ON t.id = ut.team_id
        LEFT JOIN user_form m ON ut.user_id = m.id
        LEFT JOIN user_form u ON t.created_by = u.id
        LEFT JOIN channels c ON t.id = c.team_id
        LEFT JOIN user_channels uc ON c.id = uc.channel_id
        LEFT JOIN user_form cu ON uc.user_id = cu.id
        ORDER BY t.id, c.id, m.name, cu.name;
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching teams." });
        }

        const teams = {};

        results.forEach((row) => {
            if (!teams[row.teamId]) {
                teams[row.teamId] = {
                    teamId: row.teamId,
                    teamName: row.teamName,
                    creatorName: row.creatorName,
                    members: new Set(),
                    channels: {}
                };
            }

            
            if (row.memberName) {
                teams[row.teamId].members.add(row.memberName);
            }

            
            if (row.channelId) {
                if (!teams[row.teamId].channels[row.channelId]) {
                    teams[row.teamId].channels[row.channelId] = {
                        channelName: row.channelName,
                        members: new Set()
                    };
                }
                
                
                if (row.channelUserName) {
                    teams[row.teamId].channels[row.channelId].members.add(row.channelUserName);
                }
            }
        });

        
        Object.values(teams).forEach(team => {
            team.members = Array.from(team.members);
            Object.values(team.channels).forEach(channel => {
                channel.members = Array.from(channel.members);
            });
        });

        res.json(Object.values(teams));
    });
});

app.get("/api/users", (req, res) => {
    const sql = "SELECT name FROM user_form"; 
    connection.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching users:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results); 
    });
});


app.get("/get-user-teams", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.session.user.id;

    const query = `
        SELECT 
            t.id AS teamId, 
            t.name AS teamName, 
            u.name AS creatorName,  
            utm.name AS teamMemberName,
            c.id AS channelId,
            c.name AS channelName,
            ucm.name AS channelMemberName
        FROM 
            user_teams ut
        JOIN teams t ON ut.team_id = t.id
        JOIN user_form u ON t.created_by = u.id  
        LEFT JOIN user_teams team_users ON t.id = team_users.team_id
        LEFT JOIN user_form utm ON team_users.user_id = utm.id
        LEFT JOIN channels c ON t.id = c.team_id
        LEFT JOIN user_channels uc ON c.id = uc.channel_id
        LEFT JOIN user_form ucm ON uc.user_id = ucm.id
        WHERE ut.user_id = ?
        ORDER BY t.id, c.id, ucm.name;
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching user teams." });
        }

        const userTeams = {};

        results.forEach((row) => {
            if (!userTeams[row.teamId]) {
                userTeams[row.teamId] = {
                    teamId: row.teamId,
                    teamName: row.teamName,
                    creatorName: row.creatorName,
                    members: new Set(), // Using Set to avoid duplicate entries
                    channels: {}
                };
            }

            // Add members to the team
            if (row.teamMemberName) {
                userTeams[row.teamId].members.add(row.teamMemberName);
            }

            // Add channels to the team
            if (row.channelId) {
                if (!userTeams[row.teamId].channels[row.channelId]) {
                    userTeams[row.teamId].channels[row.channelId] = {
                        channelName: row.channelName,
                        members: new Set()
                    };
                }

                if (row.channelMemberName) {
                    userTeams[row.teamId].channels[row.channelId].members.add(row.channelMemberName);
                }
            }
        });

        // Convert Sets to Arrays for JSON response
        Object.values(userTeams).forEach(team => {
            team.members = Array.from(team.members);
            Object.values(team.channels).forEach(channel => {
                channel.members = Array.from(channel.members);
            });
        });

        res.json(Object.values(userTeams));
    });
});






app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ error: "Error logging out." });
        }
        res.redirect("/login_form.html"); 
    });
});
app.post("/update-password", (req, res) => {

    const {newPassword, confirmPassword} = req.body;

    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

    const hashedPassword = crypto.createHash("md5").update(newPassword).digest("hex");
    const id = req.session.user.id;
    
    const updatePasswordQuery = "UPDATE user_form SET password = ? WHERE id = ?";

    connection.query(updatePasswordQuery, [hashedPassword, id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error updating password." });
        }

        res.status(200).json({ message: "Password updated successfully!" });
    });
});

app.post("/get-team-id-from-name", (req, res) => {
    const { teamName } = req.body; // Get teamName from request body

    if (!teamName) {
        return res.status(400).json({ error: "Team name is required." }); // Handle missing teamName
    }

    const query = "SELECT id FROM teams WHERE name = ?";
    connection.query(query, [teamName], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Team not found." }); // Handle no matching team
        }
        res.json({ teamId: results[0].id });
    });
});

app.post("/get-channels", (req, res) => {
    const { teamId } = req.body; // Get teamId from request body
    if (!teamId) {
        return res.status(400).json({ error: "Team ID is required." }); // Handle missing teamId
    }

    const query = "SELECT name FROM channels WHERE team_id = ?"; // Adjust table/column names if necessary

    connection.query(query, [teamId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "No channels found for this team." });
        }
        
        const channelNames = results.map(row => row.name); // Extract channel names
        res.json({ channels: channelNames });
    });
});

app.post("/get-channel-messages", (req, res) => {
    const { teamName, channelName } = req.body;

    if (!teamName || !channelName) {
        return res.status(400).json({ error: "Team name and channel name are required." });
    }

    const query = `
        SELECT id, sender, text FROM channels_messages 
        WHERE team_name = ? AND channel_name = ? 
        ORDER BY created_at ASC
    `;

    connection.query(query, [teamName, channelName], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }
        res.json(results);
    });
});
app.post("/remove-message", (req, res) => {
    const { messageId } = req.body;

    if (!messageId) {
        return res.status(400).json({ error: "Message ID is required." });
    }

    const query = `
        UPDATE channels_messages
        SET text = 'Removed by Admin'
        WHERE id = ?
    `;

    connection.query(query, [messageId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database update failed." });
        }

        res.json({ success: true });
    });
});

app.post("/sendChannelMessage", (req, res) => {
    const { teamName, channelName, sender, text } = req.body;

    if (!teamName || !channelName || !sender || !text) {
        return res.status(400).json({ error: "All fields are required." });
    }

    const query = `
        INSERT INTO channels_messages (team_name, channel_name, sender, text) 
        VALUES (?, ?, ?, ?)
    `;

    connection.query(query, [teamName, channelName, sender, text], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Failed to save message." });
        }
        res.json({ success: true });
    });
});

app.post("/create-group", (req, res) => {
    const { name, description } = req.body;
    const createdBy = req.session.user.id;

    if (!name || !description) {
        return res.status(400).json({ error: "Group name and description are required." });
    }

    const query = "INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)";
    connection.query(query, [name, description, createdBy], (err, result) => {
        if (err) {
            console.error("Error creating group:", err);
            return res.status(500).json({ error: "Error creating group." });
        }
        const groupId = result.insertId;
        const insertCreatorQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
        connection.query(insertCreatorQuery, [groupId, createdBy], (err) => {
            if (err) {
                console.error("Error adding creator to group:", err);
                return res.status(500).json({ error: "Group created, but error adding creator." });
            }

            res.json({ message: "Group created successfully!", groupId });
        });
    });
});
app.post("/add-user", (req, res) => {
    const { groupId, username } = req.body;

    // Get user ID by username
    const userQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(userQuery, [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }
        
        const userId = results[0].id;

        // Check if already a member
        const checkQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
        connection.query(checkQuery, [groupId, userId], (err, checkResults) => {
            if (err) return res.status(500).json({ error: "Database error." });
            if (checkResults.length > 0) return res.status(400).json({ error: "User is already a member." });

            // Add user
            const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
            connection.query(insertQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding user to group." });
                res.json({ message: "User added successfully!" });
            });
        });
    });
});

app.get("/get-groups", (req, res) => {
    const query = "SELECT id, name, description FROM groups ORDER BY created_at DESC";
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching groups:", err);
            return res.status(500).json({ error: "Error fetching groups." });
        }
        res.json(results);
    });
});

app.get("/group-members/:groupId", (req, res) => {
    const { groupId } = req.params;

    const query = `
       SELECT u.id, u.name, g.created_by AS owner_id
        FROM group_members gm 
        JOIN user_form u ON gm.user_id = u.id 
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.group_id = ?
    `;

    connection.query(query, [groupId], (err, results) => {
        if (err) {
            console.error("Error fetching group members:", err);
            return res.status(500).json({ error: "Error fetching group members." });
        }
        res.json(results);
    });
});
app.get("/group-owner/:groupId", (req, res) => {
    const { groupId } = req.params;
    
    const query = "SELECT created_by AS owner_id FROM groups WHERE id = ?";
    connection.query(query, [groupId], (err, results) => {
        if (err) {
            console.error("Error fetching group owner:", err);
            return res.status(500).json({ error: "Error fetching group owner." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Group not found." });
        }
        res.json(results[0]); 
    });
});

app.get("/group-requests/:groupId", (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user ? req.session.user.id : null;

    if (!userId) {
        console.error("Unauthorized request: No user ID found.");
        return res.status(401).json({ error: "Unauthorized request." });
    }

    // Check if the user is the owner of the group
    const checkOwnerQuery = "SELECT created_by FROM groups WHERE id = ?";
    connection.query(checkOwnerQuery, [groupId], (err, results) => {
        if (err) {
            console.error("Database error checking group owner:", err);
            return res.status(500).json({ error: "Database error." });
        }
        if (results.length === 0) {
            console.error("Group not found:", groupId);
            return res.status(404).json({ error: "Group not found." });
        }

        const isOwner = results[0].created_by === userId;
        if (!isOwner) {
            console.error("User is not the group owner:", userId);
            return res.status(403).json({ error: "You are not authorized to view this." });
        }

        // Fetch pending requests
        const query = `
            SELECT u.id, u.name 
            FROM group_requests gr 
            JOIN user_form u ON gr.user_id = u.id 
            WHERE gr.group_id = ?
        `;

        connection.query(query, [groupId], (err, results) => {
            if (err) {
                console.error("Error fetching join requests:", err);
                return res.status(500).json({ error: "Error fetching join requests." });
            }
            res.json(results);
        });
    });
});


app.post("/request-join", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;

    if (!userId) {
        return res.status(401).json({ error: "You must be logged in to request to join a group." });
    }

    // Check if the user is already a member
    const checkMembershipQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
    connection.query(checkMembershipQuery, [groupId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error while checking membership." });
        if (results.length > 0) return res.status(400).json({ error: "You are already a member of this group." });

        // Check if user is the group owner
        const checkOwnerQuery = "SELECT created_by FROM groups WHERE id = ?";
        connection.query(checkOwnerQuery, [groupId], (err, ownerResults) => {
            if (err) return res.status(500).json({ error: "Database error while checking owner." });

            const isOwner = ownerResults.length > 0 && ownerResults[0].created_by === userId;
            if (isOwner) return res.status(400).json({ error: "You are the group owner and cannot request to join." });

            // Check if user has already requested to join
            const checkRequestQuery = "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?";
            connection.query(checkRequestQuery, [groupId, userId], (err, requestResults) => {
                if (err) return res.status(500).json({ error: "Database error while checking join request." });
                if (requestResults.length > 0) return res.status(400).json({ error: "You have already requested to join this group." });

                // Insert join request
                const insertRequestQuery = "INSERT INTO group_requests (group_id, user_id) VALUES (?, ?)";
                connection.query(insertRequestQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: "Error submitting join request." });
                    res.json({ message: "Request to join sent successfully!" });
                });
            });
        });
    });
});


app.post("/approve-user", (req, res) => {
    const { groupId, userId } = req.body;

    // Remove from requests
    const deleteQuery = "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?";
    connection.query(deleteQuery, [groupId, userId], (err) => {
        if (err) return res.status(500).json({ error: "Error processing request." });

        // Add user to group
        const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
        connection.query(insertQuery, [groupId, userId], (err) => {
            if (err) return res.status(500).json({ error: "Error adding user to group." });
            res.json({ message: "User added successfully!" });
        });
    });
});



app.post("/leave-group", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;

    const query = "DELETE FROM group_members WHERE group_id = ? AND user_id = ?";
    connection.query(query, [groupId, userId], (err, result) => {
        if (err) {
            console.error("Error leaving group:", err);
            return res.status(500).json({ error: "Error leaving group." });
        }
        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "You are not a member of this group." });
        }
        res.json({ message: "You have left the group." });
    });
});
io.on("connection", (socket) => {
socket.on("send-message", (data) => {
    const { groupId, userId, message } = data;

    // Get sender's name
    const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
    connection.query(getUserQuery, [userId], (err, result) => {
        if (err || result.length === 0) return;
        const senderName = result[0].name;

        
        const insertQuery = "INSERT INTO group_messages (group_id, user_id, text) VALUES (?, ?, ?)";
        connection.query(insertQuery, [groupId, userId, message], (err) => {
            if (err) {
                console.error("Error storing message:", err);
                return;
            }

            
            io.emit(`group-message-${groupId}`, { sender: senderName, text: message });
        });
    });
});
});

// Fetch previous messages
app.get("/group-messages/:groupId", (req, res) => {
const { groupId } = req.params;

const query = `
    SELECT u.name AS sender, gm.text 
    FROM group_messages gm 
    JOIN user_form u ON gm.user_id = u.id 
    WHERE gm.group_id = ?
    ORDER BY gm.created_at ASC
`;

connection.query(query, [groupId], (err, results) => {
    if (err) return res.status(500).json({ error: "Error fetching messages." });
    res.json(results);
});
});


io.on("connection", (socket) => {
    socket.on("ChannelMessages", (msg) => {
        const query = `
        INSERT INTO channels_messages (team_name, channel_name, sender, text) 
        VALUES (?, ?, ?, ?)
    `;

    connection.query(query, [msg.teamName, msg.channelName, msg.sender, msg.text], (err,result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Failed to save message." });
        }
        else{
            const messageWithId = {
                id: result.insertId,  
                teamName: msg.teamName,
                channelName: msg.channelName,
                sender: msg.sender,
                text: msg.text
            };
            io.emit("ChannelMessages",messageWithId)
        }
       
    });
    });
});
module.exports = { app, connection };
