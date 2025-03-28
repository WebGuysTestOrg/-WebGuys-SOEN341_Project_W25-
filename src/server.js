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
let expressServer;

if (process.env.NODE_ENV !== "test") {
    expressServer = app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

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
        socket.userId = session.user.id;
        socket.userName = session.user.name;
        
        // Join global chat room
        socket.join('global-chat');
        
        // Emit last 50 messages when user connects
        const getLastMessagesQuery = `
            SELECT 
                gm.*, 
                uf.name as sender_name,
                gm.quoted_text,
                gm.quoted_sender,
                gm.timestamp
            FROM global_messages gm
            JOIN user_form uf ON gm.sender_id = uf.id
            ORDER BY gm.timestamp DESC
            LIMIT 50
        `;
        
        connection.query(getLastMessagesQuery, (err, results) => {
            if (err) {
                console.error('Error fetching global messages:', err);
                return;
            }
            socket.emit('global-chat-history', results.reverse());
        });
    } else {
        console.log(`User with no session connected`);
    }
    
    // Handle global chat messages
    socket.on('global-message', async (data) => {
        if (!socket.userId) {
            socket.emit('error', { message: 'You must be logged in to send messages' });
            return;
        }

        const message = {
            sender_id: socket.userId,
            sender_name: socket.userName,
            message: data.text,
            quoted_text: data.quoted_text,
            quoted_sender: data.quoted_sender,
            timestamp: new Date()
        };

        // Save message to database with all fields
        const insertQuery = `
            INSERT INTO global_messages 
            (sender_id, sender_name, message, quoted_text, quoted_sender, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        connection.query(
            insertQuery,
            [
                message.sender_id,
                message.sender_name,
                message.message,
                message.quoted_text,
                message.quoted_sender,
                message.timestamp
            ],
            (err, result) => {
                if (err) {
                    console.error('Error saving global message:', err);
                    socket.emit('error', { message: 'Failed to send message' });
                    return;
                }

                message.id = result.insertId;
                io.to('global-chat').emit('global-message', message);
            }
        );
    });
    
    socket.on('message',data=>{
        const message = data.text;
         
        const user = session.user && session.user.name ? `${session.user.name}[${session.user.user_type}_${session.user.id.toString().padStart(3, '0')}]`:"Anonymous"; 
        io.emit('message',{SSocketId:socket.id,user:user,text:message, userID:session.user.id})
    })
    let inactivityTimer;
    socket.on("userOnline", (userId) => {
        // Ensure userId is a string
        userId = userId.toString();
        onlineUsers.set(userId, socket.id);
        awayUsers.delete(userId);
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });

        resetInactivityTimer(userId);
    });
    socket.on("userAway", (userId) => {
        // Ensure userId is a string
        userId = userId.toString();
        awayUsers.set(userId, socket.id);
        console.log(userId)
        onlineUsers.delete(userId);
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
        
    });
    
    // Handle status update requests
    socket.on("requestStatusUpdate", () => {
        socket.emit("updateUserStatus", {
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
    password: process.env.DB_PASSWORD || "WebGuys2025!",
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
        const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text, quoted_message) VALUES (?, ?, ?, ?)";
        const quotedText = msg.quoted ? msg.quoted.text : null;
        connection.query(insertQuery, [msg.senderId, msg.recipientId, msg.text, quotedText], (err) => {
            if (err) {
                console.error("Error saving message:", err);
                return;
            }
            const fullMessage = {
                ...msg,
                quoted: msg.quoted
            };

            io.emit("private-message", fullMessage);
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
        SELECT dm.text, dm.quoted_message, dm.sender_id, dm.recipient_id, uf.name AS senderName
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
        const formattedResults = results.map(msg => ({
            id: msg.id,
            senderId: msg.sender_id,
            recipientId: msg.recipient_id,
            senderName: msg.senderName,
            text: msg.text,
            quoted: msg.quoted_message ? { text: msg.quoted_message } : null
        }));

        res.json(formattedResults);
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

  //  Full field validation
  if (!name || !email || !password || !cpassword || !user_type) {
    return res.status(400).json({ error: "All fields are required." });
  }

  // Email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  //  Passwords match check
  if (password !== cpassword) {
    return res.status(400).json({ error: "Passwords do not match!" });
  }

  //  Check if email is already registered
  const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
  connection.query(checkEmailQuery, [email], (err, emailResults) => {
    if (err) {
      console.error("Email check error:", err);
      return res.status(500).json({ error: "Server error. Please try again later." });
    }

    if (emailResults.length > 0) {
      return res.status(400).json({ error: "Email is already in use!" });
    }

    //  Check if username is already taken
    const checkUsernameQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(checkUsernameQuery, [name], (err, nameResults) => {
      if (err) {
        console.error("Username check error:", err);
        return res.status(500).json({ error: "Server error. Please try again later." });
      }

      if (nameResults.length > 0) {
        return res.status(400).json({ error: "Username is already in use!" });
      }

      // Hash password & insert user
      const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
      const insertQuery = "INSERT INTO user_form (name, email, password, user_type) VALUES (?, ?, ?, ?)";

      connection.query(insertQuery, [name, email, hashedPassword, user_type], (err) => {
        if (err) {
          console.error("Insert error:", err);
          return res.status(500).json({ error: "Error registering user." });
        }

        // Success
        res.status(200).json({ redirect: "/Login-Form.html" });
      });
    });
  });
});





app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

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

            // Log login time
            const logQuery = "INSERT INTO user_activity_log (user_id, name) VALUES (?, ?)";
            connection.query(logQuery, [user.id, user.name], (logErr) => {
                if (logErr) console.error("Error logging login:", logErr);
            });

            if (user.user_type === "admin") {
                return res.json({ 
                    redirect: "/admin_page.html",
                    user: req.session.user // <- Include this
                });
            } else {
                return res.json({ 
                    redirect: "/UserDashboard.html",
                    user: req.session.user // <- Include this
                });
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




app.post("/assign-user", async (req, res) => {
    const { teamId, channelName, userName } = req.body;

    if (!teamId || !channelName || !userName) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // First check if the user exists and get their ID
        const userQuery = "SELECT id FROM user_form WHERE name = ?";
        connection.query(userQuery, [userName], (err, userResults) => {
            if (err) {
                console.error("Error checking user:", err);
                return res.status(500).json({ error: "Database error checking user" });
            }

            if (userResults.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            const userId = userResults[0].id;

            // Check if user is a member of the team
            const teamMemberQuery = "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?";
            connection.query(teamMemberQuery, [teamId, userId], (err, teamResults) => {
                if (err) {
                    console.error("Error checking team membership:", err);
                    return res.status(500).json({ error: "Database error checking team membership" });
                }

                if (teamResults.length === 0) {
                    return res.status(400).json({ error: "User must be a team member first" });
                }

                // Check if the channel exists and get its ID
                const channelQuery = "SELECT id FROM channels WHERE team_id = ? AND name = ?";
                connection.query(channelQuery, [teamId, channelName], (err, channelResults) => {
                    if (err) {
                        console.error("Error checking channel:", err);
                        return res.status(500).json({ error: "Database error checking channel" });
                    }

                    if (channelResults.length === 0) {
                        return res.status(404).json({ error: "Channel not found" });
                    }

                    const channelId = channelResults[0].id;

                    // Check if user is already in the channel
                    const channelMemberQuery = "SELECT * FROM user_channels WHERE channel_id = ? AND user_id = ?";
                    connection.query(channelMemberQuery, [channelId, userId], (err, memberResults) => {
                        if (err) {
                            console.error("Error checking channel membership:", err);
                            return res.status(500).json({ error: "Database error checking channel membership" });
                        }

                        if (memberResults.length > 0) {
                            return res.status(400).json({ error: "User is already a member of this channel" });
                        }

                        // Finally, add the user to the channel
                        const insertQuery = "INSERT INTO user_channels (channel_id, user_id) VALUES (?, ?)";
                        connection.query(insertQuery, [channelId, userId], (err) => {
                            if (err) {
                                console.error("Error adding user to channel:", err);
                                return res.status(500).json({ error: "Database error adding user to channel" });
                            }

                            // After successful insertion, fetch the updated channel members
                            const getUpdatedMembersQuery = `
                                SELECT uf.name 
                                FROM user_channels uc 
                                JOIN user_form uf ON uc.user_id = uf.id 
                                WHERE uc.channel_id = ?
                            `;
                            connection.query(getUpdatedMembersQuery, [channelId], (err, updatedMembers) => {
                                if (err) {
                                    console.error("Error fetching updated members:", err);
                                    return res.status(500).json({ error: "User added but error fetching updated members" });
                                }

                                const memberNames = updatedMembers.map(m => m.name);
                                res.json({ 
                                    success: true, 
                                    message: "User added to channel successfully",
                                    updatedMembers: memberNames
                                });
                            });
                        });
                    });
                });
            });
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
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
    const sqlAllUsers = `SELECT DISTINCT ual.name, uf.id 
                        FROM user_activity_log ual
                        JOIN user_form uf ON ual.name = uf.name`;
    const sqlLogoutTimes = `
        SELECT name, MAX(logout_time) AS last_logout 
        FROM user_activity_log 
        GROUP BY name
    `;

    connection.query(sqlAllUsers, (err, allUsers) => {
        if (err) {
            console.error("Error fetching users:", err);
            return res.status(500).json({ error: "Database error" });
        }

        connection.query(sqlLogoutTimes, (err, logoutTimes) => {
            if (err) {
                console.error("Error fetching logout times:", err);
                return res.status(500).json({ error: "Database error" });
            }

            res.json({
                all_users: allUsers,
                user_logout_times: logoutTimes
            });
        });
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
        LEFT JOIN user_channels uc ON (c.id = uc.channel_id)
        LEFT JOIN user_form ucm ON uc.user_id = ucm.id
        WHERE ut.user_id = ? 
        AND (
            c.id IN (SELECT channel_id FROM user_channels WHERE user_id = ?)  -- Channels user is member of
            OR t.created_by = ?  -- User is team creator
            OR c.id IS NULL     -- Include teams even if they have no channels
        )
        ORDER BY t.id, c.id, ucm.name;
    `;

    connection.query(query, [userId, userId, userId], (err, results) => {
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
                    members: new Set(),
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
    if (!req.session.user) {
        return res.redirect("/Login-Form.html");
    }

    const userId = req.session.user.id;

    // Update the logout timestamp for the latest login
    const updateLogoutQuery = `
        UPDATE user_activity_log 
        SET logout_time = CURRENT_TIMESTAMP 
        WHERE user_id = ? 
        ORDER BY login_time DESC 
        LIMIT 1
    `;

    connection.query(updateLogoutQuery, [userId], (err) => {
        if (err) {
            console.error("Error logging logout:", err);
            return res.status(500).json({ error: "Error logging out." });
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) {
                console.error("Error destroying session:", sessionErr);
                return res.status(500).json({ error: "Error logging out." });
            }
            res.redirect("/Login-Form.html");
        });
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
        SELECT id, sender, text, quoted_message FROM channels_messages 
        WHERE team_name = ? AND channel_name = ? 
        ORDER BY created_at ASC
    `;

    connection.query(query, [teamName, channelName], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }

        const formattedResults = results.map(msg => ({
            id: msg.id,
            sender: msg.sender,
            text: msg.text,
            quoted: msg.quoted_message
        }));

        res.json(formattedResults);
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
    const { teamName, channelName, sender, text, quoted } = req.body;

    console.log("🟦 Quoted Message Received:", quoted);

    if (!teamName || !channelName || !sender || !text) {
        return res.status(400).json({ error: "All fields are required." });
    }

    const quotedMessageText = quoted;

    const query = `
        INSERT INTO channels_messages (team_name, channel_name, sender, text, quoted_message) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [teamName, channelName, sender, text, quotedMessageText], (err, results) => {
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
        INSERT INTO channels_messages (team_name, channel_name, sender, text, quoted_message) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [msg.teamName, msg.channelName, msg.sender, msg.text, msg.quoted], (err,result) => {
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
                text: msg.text,
                quoted: msg.quoted
            };
            io.emit("ChannelMessages",messageWithId)
        }
       
    });
    });
});

// Add endpoint to fetch global chat messages
app.get('/global-messages', (req, res) => {
    const query = `
        SELECT gm.*, uf.name as sender_name 
        FROM global_messages gm
        JOIN user_form uf ON gm.sender_id = uf.id
        ORDER BY gm.timestamp DESC
        LIMIT 50
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching global messages:', err);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        res.json(results.reverse());
    });
});

// Update the global messages query to include quoted messages
const getLastMessagesQuery = `
    SELECT 
        gm.*, 
        uf.name as sender_name,
        gm.quoted_text,
        gm.quoted_sender,
        gm.timestamp
    FROM global_messages gm
    JOIN user_form uf ON gm.sender_id = uf.id
    ORDER BY gm.timestamp DESC
    LIMIT 50
`;

// Update the database schema for global_messages table
const updateGlobalMessagesSchema = `
    ALTER TABLE global_messages 
    ADD COLUMN IF NOT EXISTS quoted_text TEXT,
    ADD COLUMN IF NOT EXISTS quoted_sender VARCHAR(255),
    MODIFY COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
`;

connection.query(updateGlobalMessagesSchema, (err) => {
    if (err) {
        console.error('Error updating global_messages schema:', err);
    }
});

module.exports = { app, io,connection, expressServer };
