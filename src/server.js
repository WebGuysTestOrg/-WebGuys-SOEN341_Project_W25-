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

// =============================================
// DATABASE CONNECTION AND SETUP
// =============================================
const connection = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
});

// Check if database exists and create if it doesn't
connection.connect((err) => {
    if (err) {
        console.error("Initial database connection failed:", err);
        process.exit(1);
    }
    
    // Check if database exists
    connection.query("SHOW DATABASES LIKE 'chathaven'", (err, results) => {
        if (err) {
            console.error("Error checking database:", err);
            process.exit(1);
        }
        
        if (results.length === 0) {
            // Database doesn't exist, create it
            connection.query("CREATE DATABASE chathaven", (err) => {
                if (err) {
                    console.error("Error creating database:", err);
                    process.exit(1);
                }
                console.log("Database 'chathaven' created successfully");
                setupDatabase();
            });
        } else {
            console.log("Database 'chathaven' already exists");
            setupDatabase();
        }
    });
});

function setupDatabase() {
    // Use the chathaven database
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error using database:", err);
            process.exit(1);
        }
        console.log("Connected to MySQL database 'chathaven'");
        
        // Create or update channels_messages table
        const createChannelsMessagesTable = `
            CREATE TABLE IF NOT EXISTS channels_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL,
                channel_name VARCHAR(255) NOT NULL,
                sender_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                quoted_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (team_name, channel_name)
            )
        `;
        
        connection.query(createChannelsMessagesTable, (err) => {
            if (err) {
                console.error("Error creating channels_messages table:", err);
                return;
            }
            console.log("Channels messages table ready");
            
            // Check if sender column exists, if not rename sender_name to sender
            connection.query("SHOW COLUMNS FROM channels_messages LIKE 'sender'", (err, results) => {
                if (err) {
                    console.error("Error checking columns:", err);
                    return;
                }
                
                // If sender column doesn't exist but sender_name does, rename it
                if (results.length === 0) {
                    connection.query("SHOW COLUMNS FROM channels_messages LIKE 'sender_name'", (err, results) => {
                        if (err) {
                            console.error("Error checking sender_name column:", err);
                            return;
                        }
                        
                        if (results.length > 0) {
                            // Rename sender_name to sender for compatibility
                            connection.query("ALTER TABLE channels_messages CHANGE sender_name sender VARCHAR(255) NOT NULL", (err) => {
                                if (err) {
                                    console.error("Error renaming sender_name column:", err);
                                    return;
                                }
                                console.log("Renamed sender_name to sender for backward compatibility");
                                preloadChannelMessages();
                            });
                        } else {
                            // Add sender column if neither exists
                            connection.query("ALTER TABLE channels_messages ADD COLUMN sender VARCHAR(255) NOT NULL AFTER channel_name", (err) => {
                                if (err) {
                                    console.error("Error adding sender column:", err);
                                    return;
                                }
                                console.log("Added sender column to channels_messages table");
                                preloadChannelMessages();
                            });
                        }
                    });
                } else {
                    // Sender column already exists, check if we need to preload messages
                    preloadChannelMessages();
                }
            });
        });
    });
}

// =============================================
// SERVER INITIALIZATION
// =============================================
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

// =============================================
// SOCKET.IO SETUP AND USER STATUS MANAGEMENT
// =============================================
const onlineUsers = new Map();
const awayUsers = new Map();
const INACTIVITY_TIME = 30000;

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000", "http://127.0.0.1:3000"]
    }
});

io.use(sharedSession(sessionMiddleware, {
    autoSave: true,
}));

// Socket connection handling
io.on('connection', socket => {
    const session = socket.handshake.session;

    if (!session || !session.user || !session.user.name) {
        console.log(`Unauthorized connection attempt - disconnecting socket ${socket.id}`);
        socket.disconnect();
        return;
    }

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
    
    socket.on('message', data => {
        if (!socket.userId) {
            socket.emit('error', { message: 'You must be logged in to send messages' });
            return;
        }
        
        const message = data.text;
        const user = `${session.user.name}[${session.user.user_type}_${session.user.id.toString().padStart(3, '0')}]`;
        io.emit('message', {SSocketId: socket.id, user: user, text: message, userID: session.user.id});
    });

    let inactivityTimer;
    socket.on("userOnline", (userId) => {
        if (!socket.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        // Convert userId to string to ensure consistent comparison
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as ONLINE (socket: ${socket.id})`);
        
        onlineUsers.set(userIdStr, socket.id);
        awayUsers.delete(userIdStr);
        
        // Log the current online users for debugging
        console.log("Current online users:", Array.from(onlineUsers.keys()));
        
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });

        resetInactivityTimer(userIdStr);
    });

    socket.on("userAway", (userId) => {
        if (!socket.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        // Convert userId to string to ensure consistent comparison
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as AWAY (socket: ${socket.id})`);
        
        awayUsers.set(userIdStr, socket.id);
        onlineUsers.delete(userIdStr);
        
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });
    
    // Handle status update requests
    socket.on("requestStatusUpdate", () => {
        if (!socket.userId) {
            socket.emit('error', { message: 'You must be logged in to request status updates' });
            return;
        }
        
        socket.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });
    
    // Handle inactivity timers for each user
    const userInactivityTimers = new Map();

    function startInactivityTimer(userId) {
        // Clear existing timer if there is one
        if (userInactivityTimers.has(userId)) {
            clearTimeout(userInactivityTimers.get(userId));
        }
        
        // Set new timer
        const timer = setTimeout(() => {
            console.log(`User ${userId} is now away due to inactivity`);
            socket.emit("userAway", userId);
        }, INACTIVITY_TIME);
        
        userInactivityTimers.set(userId, timer);
    }

    function resetInactivityTimer(userId) {
        clearTimeout(userInactivityTimers.get(userId));
        startInactivityTimer(userId);
        console.log(`Reset inactivity timer for user ${userId}`);
    }
    
    // Clean up timers when user disconnects
    socket.on("disconnect", (reason) => {
        console.log(`User ${socket.id} disconnected`);

        // Find and remove the user from online/away lists
        let disconnectedUserId = null;
        
        // Check online users
        onlineUsers.forEach((socketId, userId) => {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                console.log(`User ${userId} is now offline (was online)`);
                onlineUsers.delete(userId);
            }
        });
        
        // Check away users
        if (!disconnectedUserId) {
            awayUsers.forEach((socketId, userId) => {
                if (socketId === socket.id) {
                    disconnectedUserId = userId;
                    console.log(`User ${userId} is now offline (was away)`);
                    awayUsers.delete(userId);
                }
            });
        }
        
        // Clean up timers for this user
        if (disconnectedUserId && userInactivityTimers.has(disconnectedUserId)) {
            clearTimeout(userInactivityTimers.get(disconnectedUserId));
            userInactivityTimers.delete(disconnectedUserId);
        }
        
        // Broadcast updated status
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });
})



// Function to preload initial messages for testing
function preloadChannelMessages() {
    // Check if messages already exist
    connection.query("SELECT COUNT(*) as count FROM channels_messages", (err, results) => {
        if (err) {
            console.error("Error checking messages count:", err);
            return;
        }
        
        // If no messages, add some initial ones for testing
        if (results[0].count === 0) {
            console.log("Preloading initial channel messages for testing...");
            
            const teams = ['1211', 'Team Alpha', 'Team Beta'];
            const channels = ['general', '123', '122133', 'general2', '1212', '321', '123123', '23312', 'dasd'];
            const senders = ['Admin', 'User1', 'User2', 'ChatBot'];
            
            // Generate welcome messages for each team/channel combination
            const messages = [];
            
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
                },
                {
                    sender: 'User1',
                    text: 'Thanks for the warm welcome! I do have a question about our meeting schedule.',
                    quoted: null
                },
                {
                    sender: 'Admin',
                    text: 'We meet every Tuesday at 10am EST. I\'ll send a calendar invite.',
                    quoted: 'Thanks for the warm welcome! I do have a question about our meeting schedule.'
                },
                {
                    sender: 'ChatBot',
                    text: 'Meeting reminder: Don\'t forget to prepare your updates for the weekly sync.',
                    quoted: null
                },
                {
                    sender: 'User2',
                    text: 'I\'ve uploaded the project files to our shared drive. Please review when you get a chance.',
                    quoted: null
                },
                {
                    sender: 'User1',
                    text: 'Will do! I should be able to review them by tomorrow.',
                    quoted: 'I\'ve uploaded the project files to our shared drive. Please review when you get a chance.'
                }
            ];

            teams.forEach(team => {
                channels.forEach(channel => {
                    // Add conversation messages
                    conversations.forEach(msg => {
                        messages.push([
                            team, channel, msg.sender, 
                            msg.text, 
                            msg.quoted
                        ]);
                    });
                });
            });
            
            // Insert all preloaded messages
            const insertQuery = `
                INSERT INTO channels_messages 
                (team_name, channel_name, sender, text, quoted_message)
                VALUES ?
            `;
            
            connection.query(insertQuery, [messages], (err) => {
                if (err) {
                    console.error("Error preloading messages:", err);
                    return;
                }
                console.log("Successfully preloaded channel messages for testing");
            });
        }
    });
}

io.on("connection", (socket) => {
    socket.on("private-message", (msg) => {
        // Store the client-generated message ID
        const tempId = msg.id;
        
        // Use only the fields present in schema.sql
        const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text, timestamp) VALUES (?, ?, ?, NOW())";
        
        connection.query(insertQuery, [msg.senderId, msg.recipientId, msg.text], (err, result) => {
            if (err) {
                console.error("Error saving message:", err);
                return;
            }
            
            // Send back the full message including the quoted data, but only store essential fields in DB
            const fullMessage = {
                ...msg,
                id: result.insertId,
                tempId: tempId, // Return the tempId so client can match it
                quoted: msg.quoted // Keep this for UI, but don't store in DB
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

// Add a new route to initialize a chat between users
app.post('/init-chat', (req, res) => {
    const { userId, recipientId } = req.body;
    
    if (!userId || !recipientId) {
        return res.status(400).json({ error: "Both user IDs are required" });
    }
    
    // First check if a message already exists between these users
    const checkQuery = `
        SELECT id FROM direct_messages 
        WHERE (sender_id = ? AND recipient_id = ?) 
        OR (sender_id = ? AND recipient_id = ?)
        LIMIT 1
    `;
    
    connection.query(checkQuery, [userId, recipientId, recipientId, userId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error checking messages." });
        }
        
        if (results.length > 0) {
            // Messages already exist, no need to initialize
            return res.json({ success: true, message: "Chat already exists" });
        }
        
        // If no messages exist, create a system message to initialize the chat
        const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text) VALUES (?, ?, ?)";
        const systemMessage = "Chat initialized";
        
        connection.query(insertQuery, [userId, recipientId, systemMessage], (err, result) => {
            if (err) {
                return res.status(500).json({ error: "Failed to initialize chat." });
            }
            
            res.json({ success: true, message: "Chat initialized successfully" });
        });
    });
});



app.get('/get-messages', (req, res) => {
    const { senderId, recipientId } = req.query;
    
    // Use only the fields present in the original schema
    const query = `
        SELECT dm.id, dm.text, dm.sender_id, dm.recipient_id, dm.timestamp, uf.name AS senderName
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
            timestamp: msg.timestamp,
            // Don't include quoted field since it's not in the database
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


// =============================================
// AUTHENTICATION AND USER MANAGEMENT ROUTES
// =============================================

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
    const sqlAllUsers = `SELECT DISTINCT user_activity_log.name, user_form.id FROM user_activity_log 
                        JOIN user_form ON user_activity_log.name = user_form.name`;
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

app.get("/get-user-channels", (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.session.user.id;
    const query = `
        SELECT 
            c.id AS channelId, 
            c.name AS channelName,
            t.id AS teamId,
            t.name AS teamName
        FROM 
            user_channels uc  -- FIX: Changed from channel_members to user_channels
        JOIN channels c ON uc.channel_id = c.id
        JOIN teams t ON c.team_id = t.id
        WHERE uc.user_id = ?
        ORDER BY t.id, c.id;
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching user channels." });
        }

        const userChannels = {};

        results.forEach((row) => {
            if (!userChannels[row.teamId]) {
                userChannels[row.teamId] = {
                    teamId: row.teamId,
                    teamName: row.teamName,
                    channels: []
                };
            }

            userChannels[row.teamId].channels.push({
                channelId: row.channelId,
                channelName: row.channelName
            });
        });

        res.json(Object.values(userChannels));
        console.log(Object.values(userChannels))
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

    const query = "INSERT INTO `groups` (name, description, created_by) VALUES (?, ?, ?)";
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

            // Add a welcome system message
            const welcomeMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
            const welcomeMessage = `Welcome to the "${name}" channel! This channel was created by ${req.session.user.name}.`;
            
            connection.query(welcomeMessageQuery, [groupId, createdBy, welcomeMessage], (err) => {
                if (err) {
                    console.error("Error adding welcome message:", err);
                }
                
                res.json({ message: "Group created successfully!", groupId });
            });
        });
    });
});
app.post("/add-user", (req, res) => {
    const { groupId, username } = req.body;
    const addedBy = req.session.user.name;

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
                
                // Add system message
                const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                const systemMessage = `${username} was added to the channel by ${addedBy}.`;
                
                connection.query(systemMessageQuery, [groupId, req.session.user.id, systemMessage], (err) => {
                    if (err) {
                        console.error("Error adding system message:", err);
                    }
                    
                    res.json({ message: "User added successfully!" });
                });
            });
        });
    });
});

app.get("/get-groups", (req, res) => {
    const query = "SELECT id, name, description FROM `groups` ORDER BY created_at DESC";
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
        JOIN \`groups\` g ON g.id = gm.group_id
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
    
    const query = "SELECT created_by AS owner_id FROM `groups` WHERE id = ?";
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
    const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
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
        const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
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
    const approvedBy = req.session.user.name;

    // Get user name
    const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
    connection.query(getUserQuery, [userId], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }
        
        const username = userResults[0].name;

        // Remove from requests
        const deleteQuery = "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?";
        connection.query(deleteQuery, [groupId, userId], (err) => {
            if (err) return res.status(500).json({ error: "Error processing request." });

            // Add user to group
            const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
            connection.query(insertQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding user to group." });
                
                // Add system message
                const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                const systemMessage = `${username}'s request to join was approved by ${approvedBy}.`;
                
                connection.query(systemMessageQuery, [groupId, req.session.user.id, systemMessage], (err) => {
                    if (err) {
                        console.error("Error adding system message:", err);
                    }
                    
                    res.json({ message: "User added successfully!" });
                });
            });
        });
    });
});



app.post("/leave-group", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;
    const userName = req.session.user.name;

    // Check if the user is the owner
    const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
    connection.query(checkOwnerQuery, [groupId], (err, results) => {
        if (err) {
            console.error("Database error checking group owner:", err);
            return res.status(500).json({ error: "Database error." });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: "Group not found." });
        }
        
        // Prevent the owner from leaving their own channel
        if (results[0].created_by === userId) {
            return res.status(403).json({ error: "As the owner, you cannot leave your own channel. You can delete it instead." });
        }

        // Add system message before removing the user
        const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
        const systemMessage = `${userName} has left the channel.`;
        
        connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
            if (err) {
                console.error("Error adding system message:", err);
            }
            
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
    });
});

// Add endpoint to update group description
app.post("/update-group-description", (req, res) => {
    const { groupId, description } = req.body;
    const userId = req.session.user.id;
    const userName = req.session.user.name;

    // Check if user is the owner of the group
    const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
    connection.query(checkOwnerQuery, [groupId], (err, results) => {
        if (err) {
            console.error("Database error checking group owner:", err);
            return res.status(500).json({ error: "Database error." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Group not found." });
        }

        const isOwner = results[0].created_by === userId;
        if (!isOwner) {
            return res.status(403).json({ error: "Only the channel owner can update the description." });
        }

        // Update group description
        const updateQuery = "UPDATE `groups` SET description = ? WHERE id = ?";
        connection.query(updateQuery, [description, groupId], (err) => {
            if (err) {
                console.error("Error updating group description:", err);
                return res.status(500).json({ error: "Error updating group description." });
            }

            // Add system message for the description change
            const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
            const systemMessage = `${userName} updated the channel description.`;
            
            connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
                if (err) {
                    console.error("Error adding system message:", err);
                }
                
                res.json({ message: "Channel description updated successfully!" });
            });
        });
    });
});

// Add endpoint to remove user from group (for admins)
app.post("/remove-group-member", (req, res) => {
    const { groupId, memberId } = req.body;
    const userId = req.session.user.id;
    const adminName = req.session.user.name;

    // Check if user is the owner of the group
    const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
    connection.query(checkOwnerQuery, [groupId], (err, results) => {
        if (err) {
            console.error("Database error checking group owner:", err);
            return res.status(500).json({ error: "Database error." });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Group not found." });
        }

        const isOwner = results[0].created_by === userId;
        if (!isOwner) {
            return res.status(403).json({ error: "Only the channel owner can remove members." });
        }

        // Get member's name before removing
        const getMemberQuery = "SELECT name FROM user_form WHERE id = ?";
        connection.query(getMemberQuery, [memberId], (err, userResults) => {
            if (err || userResults.length === 0) {
                return res.status(400).json({ error: "User not found." });
            }

            const memberName = userResults[0].name;

            // Add system message before removing the user
            const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
            const systemMessage = `${memberName} was removed from the channel by ${adminName}.`;
            
            connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
                if (err) {
                    console.error("Error adding system message:", err);
                }
                
                // Remove the user from the group
                const removeQuery = "DELETE FROM group_members WHERE group_id = ? AND user_id = ?";
                connection.query(removeQuery, [groupId, memberId], (err, result) => {
                    if (err) {
                        console.error("Error removing member:", err);
                        return res.status(500).json({ error: "Error removing member from channel." });
                    }
                    if (result.affectedRows === 0) {
                        return res.status(400).json({ error: "User is not a member of this channel." });
                    }
                    res.json({ message: "Member removed successfully!" });
                });
            });
        });
    });
});

// Enhance group message handling with better status management
io.on("connection", (socket) => {
    const session = socket.handshake.session;
    
    // Group message handling
    socket.on("send-message", (data) => {
        const { groupId, userId, message } = data;

        // Get sender's name
        const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
        connection.query(getUserQuery, [userId], (err, result) => {
            if (err || result.length === 0) {
                console.error("Error getting user info:", err);
                socket.emit('error', { message: 'Failed to send message' });
                return;
            }
            
            const senderName = result[0].name;
            
            // Insert message into database
            const insertQuery = "INSERT INTO group_messages (group_id, user_id, text) VALUES (?, ?, ?)";
            connection.query(insertQuery, [groupId, userId, message], (err, result) => {
                if (err) {
                    console.error("Error storing message:", err);
                    socket.emit('error', { message: 'Failed to save message' });
                    return;
                }

                const messageData = {
                    id: result.insertId,
                    sender: senderName,
                    text: message,
                    timestamp: new Date()
                };
                
                // Broadcast message to all connected clients
                io.emit(`group-message-${groupId}`, messageData);
            });
        });
    });

    // Enhanced status request functionality
    socket.on("requestStatusUpdate", () => {
        if (!socket.userId && session && session.user) {
            socket.userId = session.user.id;
        }
        
        // Only respond to authenticated requests
        if (!socket.userId) {
            console.log("Unauthenticated status request");
            socket.emit('error', { message: 'Authentication required for status updates' });
            return;
        }
        
        socket.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });
});

// Fetch previous messages
app.get("/group-messages/:groupId", (req, res) => {
    const { groupId } = req.params;

    const query = `
        SELECT u.name AS sender, gm.text, gm.is_system_message
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

    connection.query(query, [msg.teamName, msg.channelName, msg.sender, msg.text, msg.quoted], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            socket.emit("error", { message: "Failed to save message" });
            return;
        }
        
        const messageWithId = {
            id: result.insertId,  
            teamName: msg.teamName,
            channelName: msg.channelName,
            sender: msg.sender,
            text: msg.text,
            quoted: msg.quoted
        };
        io.emit("ChannelMessages", messageWithId);
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
            return res.status(500).json({ error: 'Failed to fetch global messages' });
        }
        res.json(results);
    });
});

// Export the app and connection for testing
module.exports = {
    app,
    connection
};