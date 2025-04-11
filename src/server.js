const crypto = require("crypto");
const path = require("path");
const sharedSession = require("express-socket.io-session"); 
const {Server} = require("socket.io");
const connection = require('./config/db');
const { app, sessionMiddleware } = require('./app');

// Import routes
const userRoutes = require('./routes/userRoutes');
const teamRoutes = require('./routes/teamRoutes');
const channelRoutes = require('./routes/channelRoutes');
const chatRoutes = require('./routes/chatRoutes');
const groupMessagesRoute = require('./routes/groupMessages');

// Use routes
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', groupMessagesRoute);

const PORT = process.env.PORT || 3000;
let expressServer;

// =============================================
// SERVER INITIALIZATION & APP CONFIGURATION - REVISED
// =============================================

// Start the server (using the imported app)
if (process.env.NODE_ENV !== "test") {
    expressServer = app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

// =============================================
// SOCKET.IO SETUP AND USER STATUS MANAGEMENT
// =============================================
const onlineUsers = new Map();
const awayUsers = new Map();
const userInactivityTimers = new Map();
const INACTIVITY_TIME = 30000; // 30 seconds

// Pass the existing expressServer instance to Socket.IO
const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"]
    }
});

// Use the imported sessionMiddleware for Socket.IO
io.use(sharedSession(sessionMiddleware, {
    autoSave: true,
}));

// Socket connection handling
io.on('connection', socket => {
    console.log('New socket connection:', socket.id);

    const session = socket.handshake.session;

    if (!session?.user?.name) {
        console.log(`Unauthorized connection attempt - disconnecting socket ${socket.id}`);
        socket.disconnect();
        return;
    }

    console.log(`User ${session.user.name} connected (${session.user.user_type})`);
    socket.userId = session.user.id;
    socket.userName = session.user.name;
    socket.userType = session.user.user_type;
    
    // Join global chat room
    socket.join('global-chat');
    
    // Initialize socket handlers
    require('./socket/handlers/globalChat')(socket, io, connection);
    require('./socket/handlers/privateMessages')(socket, io, connection);
    require('./socket/handlers/groupMessages')(socket, io, connection);
    require('./socket/handlers/channelMessages')(socket, io, connection);

    const fetchUserNames = async (userIds) => {
        if (userIds.length === 0) return [];
        const placeholders = userIds.map(() => '?').join(', ');
        const sql = `SELECT name FROM user_form WHERE id IN (${placeholders})`;
        
        return new Promise((resolve, reject) => {
            connection.query(sql, userIds, (err, results) => {
                if (err) return reject(err);
                resolve(results.map(row => row.name));
            });
        });
    };

    socket.on("userOnline", async (userId) => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as ONLINE (socket: ${socket.id}, type: ${socket.userType})`);
        
        onlineUsers.set(userIdStr, socket.id);
        awayUsers.delete(userIdStr);
        
        try {
            const [onlineNames, awayNames] = await Promise.all([
                fetchUserNames(Array.from(onlineUsers.keys())),
                fetchUserNames(Array.from(awayUsers.keys()))
            ]);
            
            io.emit("updateUserStatus", {
                online: Array.from(onlineUsers.keys()),
                online_names: onlineNames,
                away: Array.from(awayUsers.keys()),
                away_names: awayNames
            });
            
            resetInactivityTimer(userIdStr);
        } catch (err) {
            console.error('Error fetching user names:', err);
        }
    });
    socket.on("userAway", async (userId) => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as AWAY (socket: ${socket.id})`);
        
        awayUsers.set(userIdStr, socket.id);
        onlineUsers.delete(userIdStr);
        
        try {
            const [onlineNames, awayNames] = await Promise.all([
                fetchUserNames(Array.from(onlineUsers.keys())),
                fetchUserNames(Array.from(awayUsers.keys()))
            ]);
            
            io.emit("updateUserStatus", {
                online: Array.from(onlineUsers.keys()),
                online_names: onlineNames,
                away: Array.from(awayUsers.keys()),
                away_names: awayNames
            });
            
            resetInactivityTimer(userIdStr);
        } catch (err) {
            console.error('Error fetching user names:', err);
        }
    });

    // Handle status update requests
    socket.on("requestStatusUpdate", () => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to request status updates' });
            return;
        }
        
        socket.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });

    // Inactivity timer functions
    function startInactivityTimer(userId) {
        if (userInactivityTimers.has(userId)) {
            clearTimeout(userInactivityTimers.get(userId));
        }
        
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

    // Handle disconnection
    socket.on("disconnect", (reason) => {
        console.log(`User ${socket.id} disconnected`);

        let disconnectedUserId = null;
        
        onlineUsers.forEach((socketId, userId) => {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                console.log(`User ${userId} is now offline (was online)`);
                onlineUsers.delete(userId);
            }
        });
        
        if (!disconnectedUserId) {
            awayUsers.forEach((socketId, userId) => {
                if (socketId === socket.id) {
                    disconnectedUserId = userId;
                    console.log(`User ${userId} is now offline (was away)`);
                    awayUsers.delete(userId);
                }
            });
        }
        
        if (disconnectedUserId && userInactivityTimers.has(disconnectedUserId)) {
            clearTimeout(userInactivityTimers.get(disconnectedUserId));
            userInactivityTimers.delete(disconnectedUserId);
        }
        
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
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

  checkEmailExists(name, email, password, user_type, res);
});

// Helper function to check if email exists
function checkEmailExists(name, email, password, user_type, res) {
  const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
  connection.query(checkEmailQuery, [email], (err, emailResults) => {
    if (err) {
      console.error("Email check error:", err);
      return res.status(500).json({ error: "Server error. Please try again later." });
    }

    if (emailResults.length > 0) {
      return res.status(400).json({ error: "Email is already in use!" });
    }

    checkUsernameExists(name, email, password, user_type, res);
  });
}

// Helper function to check if username exists
function checkUsernameExists(name, email, password, user_type, res) {
    const checkUsernameQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(checkUsernameQuery, [name], (err, nameResults) => {
      if (err) {
        console.error("Username check error:", err);
        return res.status(500).json({ error: "Server error. Please try again later." });
      }

      if (nameResults.length > 0) {
        return res.status(400).json({ error: "Username is already in use!" });
      }

    insertNewUser(name, email, password, user_type, res);
  });
}

// Helper function to insert new user
function insertNewUser(name, email, password, user_type, res) {
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
}

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
                    redirect: "/AdminDashboard.html",
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
app.get("/user-info", (req, res) => {
    if (!req.session?.user) {
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
    if (!req.session?.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ 
        name: req.session.user.name, 
        email: req.session.user.email, 
        id: req.session.user.id,
        role: req.session.user.user_type
    
    });
});

app.post("/create-team", (req, res) => {
    if (!req.session?.user || req.session.user.user_type !== "admin") {
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
    if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });

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

// Delete team and all associated channels
app.post('/delete-team', (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { teamId } = req.body;
    const userId = req.session.user.id;

    if (!teamId) {
        return res.status(400).json({ error: "Team ID is required." });
    }

    // First verify that this user is the team creator (owner)
    const checkTeamCreatorQuery = "SELECT created_by FROM teams WHERE id = ?";
    connection.query(checkTeamCreatorQuery, [teamId], (err, results) => {
        if (err) {
            console.error("Error checking team creator:", err);
            return res.status(500).json({ error: "Database error." });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Team not found." });
        }

        const creatorId = results[0].created_by;

        // Only allow team creator or admin to delete the team
        if (creatorId !== userId && req.session.user.user_type !== 'admin') {
            return res.status(403).json({ error: "Only the team creator or an admin can delete a team." });
        }

        getTeamChannelsAndStartDeletion(teamId, res);
    });
});

// Helper function to get team channels and start the deletion process
function getTeamChannelsAndStartDeletion(teamId, res) {
        // Get all channels in this team
        const getChannelsQuery = "SELECT id FROM channels WHERE team_id = ?";
        connection.query(getChannelsQuery, [teamId], (err, channelResults) => {
            if (err) {
                console.error("Error fetching team channels:", err);
                return res.status(500).json({ error: "Error fetching team channels." });
            }

            // Extract channel IDs
            const channelIds = channelResults.map(channel => channel.id);

            // Begin transaction for the multi-step deletion
            connection.beginTransaction(err => {
                if (err) {
                    console.error("Error starting transaction:", err);
                    return res.status(500).json({ error: "Error starting database transaction." });
                }

            deleteTeamChannelMessages(teamId, channelIds, res);
        });
    });
}

// Helper function to delete team channel messages
function deleteTeamChannelMessages(teamId, channelIds, res) {
                const deleteMessagesQuery = "DELETE FROM channels_messages WHERE team_name = (SELECT name FROM teams WHERE id = ?)";
                connection.query(deleteMessagesQuery, [teamId], err => {
                    if (err) {
                        console.error("Error deleting team channel messages:", err);
                        return connection.rollback(() => {
                            res.status(500).json({ error: "Error deleting team channel messages." });
                        });
                    }

        deleteUserChannelAssociations(teamId, channelIds, res);
    });
}

// Helper function to delete user-channel associations
function deleteUserChannelAssociations(teamId, channelIds, res) {
                        // Delete user_channels entries
                        const deleteUserChannelsQuery = channelIds.length > 0 ? 
                            "DELETE FROM user_channels WHERE channel_id IN (?)" : 
                            "SELECT 1"; // Dummy query if no channels
                        
                        const queryParams = channelIds.length > 0 ? [channelIds] : [];
                        
                        connection.query(deleteUserChannelsQuery, queryParams, err => {
                            if (err) {
                                console.error("Error deleting user_channels:", err);
                                return connection.rollback(() => {
                                    res.status(500).json({ error: "Error deleting user channel associations." });
                                });
                            }

        deleteTeamChannels(teamId, res);
    });
}

// Helper function to delete team channels
function deleteTeamChannels(teamId, res) {
                            const deleteChannelsQuery = "DELETE FROM channels WHERE team_id = ?";
                            connection.query(deleteChannelsQuery, [teamId], err => {
                                if (err) {
                                    console.error("Error deleting channels:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error deleting team channels." });
                                    });
                                }

        deleteUserTeamAssociations(teamId, res);
    });
}

// Helper function to delete user-team associations
function deleteUserTeamAssociations(teamId, res) {
                                const deleteUserTeamsQuery = "DELETE FROM user_teams WHERE team_id = ?";
                                connection.query(deleteUserTeamsQuery, [teamId], err => {
                                    if (err) {
                                        console.error("Error deleting user_teams:", err);
                                        return connection.rollback(() => {
                                            res.status(500).json({ error: "Error deleting user team associations." });
                                        });
                                    }

        deleteTeam(teamId, res);
    });
}

// Helper function to delete the team
function deleteTeam(teamId, res) {
                                    const deleteTeamQuery = "DELETE FROM teams WHERE id = ?";
                                    connection.query(deleteTeamQuery, [teamId], err => {
                                        if (err) {
                                            console.error("Error deleting team:", err);
                                            return connection.rollback(() => {
                                                res.status(500).json({ error: "Error deleting team." });
                                            });
                                        }

                                        // Commit the transaction
                                        connection.commit(err => {
                                            if (err) {
                                                console.error("Error committing transaction:", err);
                                                return connection.rollback(() => {
                                                    res.status(500).json({ error: "Error completing deletion, transaction failed." });
                                                });
                                            }

                                            res.json({ message: "Team and all associated channels successfully deleted." });
                                        });
                                    });
}

// Remove a user from a team
app.post('/remove-team-member', (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { teamId, userId: memberIdToRemove } = req.body;
    const userId = req.session.user.id;

    if (!teamId || !memberIdToRemove) {
        return res.status(400).json({ error: "Team ID and User ID are required." });
    }

    // First verify that this user is the team creator (owner) or an admin
    const checkTeamCreatorQuery = "SELECT created_by FROM teams WHERE id = ?";
    connection.query(checkTeamCreatorQuery, [teamId], (err, results) => {
        if (err) {
            console.error("Error checking team creator:", err);
            return res.status(500).json({ error: "Database error." });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Team not found." });
        }

        const creatorId = results[0].created_by;

        // Only allow team creator or admin to remove members
        if (creatorId !== userId && req.session.user.user_type !== 'admin') {
            return res.status(403).json({ error: "Only the team creator or an admin can remove team members." });
        }

        // Don't allow removing the team creator
        if (memberIdToRemove == creatorId) {
            return res.status(403).json({ error: "Cannot remove the team creator from their own team." });
        }

        checkUserTeamMembership(teamId, memberIdToRemove, res);
    });
});

// Helper function to check user team membership
function checkUserTeamMembership(teamId, memberIdToRemove, res) {
        // Check if user is in the team
        const checkUserInTeamQuery = "SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?";
        connection.query(checkUserInTeamQuery, [memberIdToRemove, teamId], (err, userTeamResults) => {
            if (err) {
                console.error("Error checking user team membership:", err);
                return res.status(500).json({ error: "Database error." });
            }

            if (userTeamResults.length === 0) {
                return res.status(404).json({ error: "User is not a member of this team." });
            }

        startTeamMemberRemovalTransaction(teamId, memberIdToRemove, res);
    });
}

// Helper function to start transaction for member removal
function startTeamMemberRemovalTransaction(teamId, memberIdToRemove, res) {
            // Begin transaction for the multi-step removal
            connection.beginTransaction(err => {
                if (err) {
                    console.error("Error starting transaction:", err);
                    return res.status(500).json({ error: "Error starting database transaction." });
                }

        getTeamChannelsForMemberRemoval(teamId, memberIdToRemove, res);
    });
}

// Helper function to get team channels for member removal
function getTeamChannelsForMemberRemoval(teamId, memberIdToRemove, res) {
                // Get all channels in this team
                const getChannelsQuery = "SELECT id FROM channels WHERE team_id = ?";
                connection.query(getChannelsQuery, [teamId], (err, channelResults) => {
                    if (err) {
                        console.error("Error fetching team channels:", err);
                        return connection.rollback(() => {
                            res.status(500).json({ error: "Error fetching team channels." });
                        });
                    }

                    // Extract channel IDs
                    const channelIds = channelResults.map(channel => channel.id);
        removeUserFromChannels(teamId, memberIdToRemove, channelIds, res);
    });
}

// Helper function to remove user from channels
function removeUserFromChannels(teamId, memberIdToRemove, channelIds, res) {
                        if (channelIds.length > 0) {
                            const deleteUserChannelsQuery = "DELETE FROM user_channels WHERE user_id = ? AND channel_id IN (?)";
                            connection.query(deleteUserChannelsQuery, [memberIdToRemove, channelIds], err => {
                                if (err) {
                                    console.error("Error removing user from channels:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error removing user from team channels." });
                                    });
                                }
            removeUserFromTeam(teamId, memberIdToRemove, res);
                            });
                        } else {
        removeUserFromTeam(teamId, memberIdToRemove, res);
                        }
}

// Helper function to remove user from team
function removeUserFromTeam(teamId, memberIdToRemove, res) {
                        const deleteUserTeamQuery = "DELETE FROM user_teams WHERE user_id = ? AND team_id = ?";
                        connection.query(deleteUserTeamQuery, [memberIdToRemove, teamId], err => {
                            if (err) {
                                console.error("Error removing user from team:", err);
                                return connection.rollback(() => {
                                    res.status(500).json({ error: "Error removing user from team." });
                                });
                            }

        commitMemberRemovalTransaction(res);
    });
}

// Helper function to commit the transaction
function commitMemberRemovalTransaction(res) {
                            connection.commit(err => {
                                if (err) {
                                    console.error("Error committing transaction:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error completing removal, transaction failed." });
                                    });
                                }

                                res.json({ message: "User successfully removed from team and all associated channels." });
                            });
}

app.post("/assign-user", async (req, res) => {
    const { teamId, channelName, userName } = req.body;

    if (!teamId || !channelName || !userName) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        findUserByName(teamId, channelName, userName, res);
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Helper function to find user by name
function findUserByName(teamId, channelName, userName, res) {
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
        checkTeamMembership(teamId, channelName, userId, userName, res);
    });
}

// Helper function to check team membership
function checkTeamMembership(teamId, channelName, userId, userName, res) {
            const teamMemberQuery = "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?";
            connection.query(teamMemberQuery, [teamId, userId], (err, teamResults) => {
                if (err) {
                    console.error("Error checking team membership:", err);
                    return res.status(500).json({ error: "Database error checking team membership" });
                }

                if (teamResults.length === 0) {
                    return res.status(400).json({ error: "User must be a team member first" });
                }

        findChannelByName(teamId, channelName, userId, userName, res);
    });
}

// Helper function to find channel by name
function findChannelByName(teamId, channelName, userId, userName, res) {
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
        checkChannelMembership(channelId, userId, userName, res);
    });
}

// Helper function to check channel membership
function checkChannelMembership(channelId, userId, userName, res) {
                    const channelMemberQuery = "SELECT * FROM user_channels WHERE channel_id = ? AND user_id = ?";
                    connection.query(channelMemberQuery, [channelId, userId], (err, memberResults) => {
                        if (err) {
                            console.error("Error checking channel membership:", err);
                            return res.status(500).json({ error: "Database error checking channel membership" });
                        }

                        if (memberResults.length > 0) {
                            return res.status(400).json({ error: "User is already a member of this channel" });
                        }

        addUserToChannel(channelId, userId, userName, res);
    });
}

// Helper function to add user to channel
function addUserToChannel(channelId, userId, userName, res) {
                        const insertQuery = "INSERT INTO user_channels (channel_id, user_id) VALUES (?, ?)";
                        connection.query(insertQuery, [channelId, userId], (err) => {
                            if (err) {
                                console.error("Error adding user to channel:", err);
                                return res.status(500).json({ error: "Database error adding user to channel" });
                            }

        fetchUpdatedChannelMembers(channelId, userName, res);
    });
}

// Helper function to fetch updated channel members
function fetchUpdatedChannelMembers(channelId, userName, res) {
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
}

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
    if (!req.session?.user) {
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
    if (!req.session?.user) {
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
    if (!req.session?.user) {
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

    if (!req.session?.user) {
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
    const userId = req.session.user.id;

    findUserByUsername(groupId, username, addedBy, userId, res);
});

// Helper function to find user by username
function findUserByUsername(groupId, username, addedBy, userId, res) {
    // Get user ID by username
    const userQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(userQuery, [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }
        
        const targetUserId = results[0].id;
        checkIfAlreadyMember(groupId, username, addedBy, userId, targetUserId, res);
    });
}

// Helper function to check if user is already a member
function checkIfAlreadyMember(groupId, username, addedBy, userId, targetUserId, res) {
        // Check if already a member
        const checkQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
    connection.query(checkQuery, [groupId, targetUserId], (err, checkResults) => {
            if (err) return res.status(500).json({ error: "Database error." });
            if (checkResults.length > 0) return res.status(400).json({ error: "User is already a member." });

        addUserToGroup(groupId, username, addedBy, userId, targetUserId, res);
    });
}

// Helper function to add user to group
function addUserToGroup(groupId, username, addedBy, userId, targetUserId, res) {
            // Add user
            const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
    connection.query(insertQuery, [groupId, targetUserId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding user to group." });
                
        addSystemMessage(groupId, username, addedBy, userId, res);
    });
}

// Helper function to add system message
function addSystemMessage(groupId, username, addedBy, userId, res) {
                // Add system message
                const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                const systemMessage = `${username} was added to the channel by ${addedBy}.`;
                
    connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
                    if (err) {
                        console.error("Error adding system message:", err);
                    }
                    
                    res.json({ message: "User added successfully!" });
                });
}

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
    const userId = req.session?.user?.id || null;

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

    checkExistingMembership(groupId, userId, res);
});

// Helper function to check existing membership
function checkExistingMembership(groupId, userId, res) {
    // Check if the user is already a member
    const checkMembershipQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
    connection.query(checkMembershipQuery, [groupId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error while checking membership." });
        if (results.length > 0) return res.status(400).json({ error: "You are already a member of this group." });

        checkGroupOwnership(groupId, userId, res);
    });
}

// Helper function to check group ownership
function checkGroupOwnership(groupId, userId, res) {
        // Check if user is the group owner
        const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
        connection.query(checkOwnerQuery, [groupId], (err, ownerResults) => {
            if (err) return res.status(500).json({ error: "Database error while checking owner." });

            const isOwner = ownerResults.length > 0 && ownerResults[0].created_by === userId;
            if (isOwner) return res.status(400).json({ error: "You are the group owner and cannot request to join." });

        checkExistingRequest(groupId, userId, res);
    });
}

// Helper function to check existing join request
function checkExistingRequest(groupId, userId, res) {
            // Check if user has already requested to join
            const checkRequestQuery = "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?";
            connection.query(checkRequestQuery, [groupId, userId], (err, requestResults) => {
                if (err) return res.status(500).json({ error: "Database error while checking join request." });
                if (requestResults.length > 0) return res.status(400).json({ error: "You have already requested to join this group." });

        insertJoinRequest(groupId, userId, res);
    });
}

// Helper function to insert join request
function insertJoinRequest(groupId, userId, res) {
                // Insert join request
                const insertRequestQuery = "INSERT INTO group_requests (group_id, user_id) VALUES (?, ?)";
                connection.query(insertRequestQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: "Error submitting join request." });
                    res.json({ message: "Request to join sent successfully!" });
                });
}

app.post("/approve-user", (req, res) => {
    const { groupId, userId } = req.body;
    const approvedBy = req.session.user.name;
    const approverId = req.session.user.id;

    getUsernameForApproval(groupId, userId, approvedBy, approverId, res);
});

// Helper function to get username for approval
function getUsernameForApproval(groupId, userId, approvedBy, approverId, res) {
    // Get user name
    const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
    connection.query(getUserQuery, [userId], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }
        
        const username = userResults[0].name;
        removeJoinRequest(groupId, userId, username, approvedBy, approverId, res);
    });
}

// Helper function to remove join request
function removeJoinRequest(groupId, userId, username, approvedBy, approverId, res) {
        // Remove from requests
        const deleteQuery = "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?";
        connection.query(deleteQuery, [groupId, userId], (err) => {
            if (err) return res.status(500).json({ error: "Error processing request." });

        addUserToGroupAfterApproval(groupId, userId, username, approvedBy, approverId, res);
    });
}

// Helper function to add user to group after approval
function addUserToGroupAfterApproval(groupId, userId, username, approvedBy, approverId, res) {
            // Add user to group
            const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
            connection.query(insertQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding user to group." });
                
        addApprovalSystemMessage(groupId, username, approvedBy, approverId, res);
    });
}

// Helper function to add approval system message
function addApprovalSystemMessage(groupId, username, approvedBy, approverId, res) {
                // Add system message
                const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                const systemMessage = `${username}'s request to join was approved by ${approvedBy}.`;
                
    connection.query(systemMessageQuery, [groupId, approverId, systemMessage], (err) => {
                    if (err) {
                        console.error("Error adding system message:", err);
                    }
                    
                    res.json({ message: "User added successfully!" });
                });
}

app.post("/leave-group", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;
    const userName = req.session.user.name;

    checkIfGroupOwner(groupId, userId, userName, res);
});

// Helper function to check if user is the group owner
function checkIfGroupOwner(groupId, userId, userName, res) {
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

        addLeaveSystemMessage(groupId, userId, userName, res);
    });
}

// Helper function to add leave system message
function addLeaveSystemMessage(groupId, userId, userName, res) {
        // Add system message before removing the user
        const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
        const systemMessage = `${userName} has left the channel.`;
        
        connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
            if (err) {
                console.error("Error adding system message:", err);
            }
            
        removeUserFromGroupMembership(groupId, userId, res);
    });
}

// Helper function to remove user from group membership
function removeUserFromGroupMembership(groupId, userId, res) {
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
}

app.put('/api/messages/:id/pin', (req, res) => {
    const messageId = req.params.id;
    getMessageDetails(messageId, res);
});

// Helper function to get message details
function getMessageDetails(messageId, res) {
    connection.query(
        'SELECT sender_id, recipient_id FROM direct_messages WHERE id = ?',
        [messageId],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'Message not found' });
            }

            const { sender_id, recipient_id } = results[0];
            unpinExistingMessages(messageId, sender_id, recipient_id, res);
        }
    );
}

// Helper function to unpin existing messages
function unpinExistingMessages(messageId, sender_id, recipient_id, res) {
            connection.query(
                `UPDATE direct_messages SET pinned = FALSE 
                 WHERE (sender_id = ? AND recipient_id = ?) 
                    OR (sender_id = ? AND recipient_id = ?)`,
                [sender_id, recipient_id, recipient_id, sender_id],
                (unpinErr) => {
                    if (unpinErr) {
                        console.error(unpinErr);
                        return res.status(500).json({ error: 'Error unpinning old messages' });
                    }

            pinNewMessage(messageId, res);
        }
    );
}
                   
// Helper function to pin new message
function pinNewMessage(messageId, res) {
                    connection.query(
                        'UPDATE direct_messages SET pinned = TRUE WHERE id = ?',
                        [messageId],
                        (pinErr) => {
                            if (pinErr) {
                                console.error(pinErr);
                                return res.status(500).json({ error: 'Error pinning message' });
                            }

                            res.json({ message: 'Message pinned successfully' });
                        }
                    );
                }

app.get('/api/messages/pinned', (req, res) => {
    const { senderId, recipientId } = req.query;

    if (!senderId || !recipientId) {
        return res.status(400).json({ error: 'Missing senderId or recipientId in query' });
    }

    const query = `
        SELECT * FROM direct_messages 
        WHERE pinned = TRUE AND (
            (sender_id = ? AND recipient_id = ?) 
            OR 
            (sender_id = ? AND recipient_id = ?)
        )
        LIMIT 1
    `;

    connection.query(query, [senderId, recipientId, recipientId, senderId], (err, results) => {
        if (err) {
            console.error('Error fetching pinned message:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const pinnedMessage = results.length > 0 ? results[0] : null;
        res.json(pinnedMessage);
    });
});

app.put('/api/messages/:id/unpin', (req, res) => {
    const messageId = req.params.id;

    connection.query(
        'UPDATE direct_messages SET pinned = FALSE WHERE id = ?',
        [messageId],
        (err, results) => {
            if (err) {
                console.error("Error unpinning message:", err);
                return res.status(500).json({ error: 'Failed to unpin message' });
            }

            res.json({ success: true });
        }
    );
});

app.put('/api/channel-messages/:id/pin', (req, res) => {
    const messageId = req.params.id;

    connection.query(`
        UPDATE channels_messages SET pinned = true WHERE id = ?
    `, [messageId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to pin message' });
        res.json({ success: true });
    });
});

app.put('/api/channel-messages/:id/unpin', (req, res) => {
    const messageId = req.params.id;

    connection.query(`
        UPDATE channels_messages SET pinned = false WHERE id = ?
    `, [messageId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to unpin message' });
        res.json({ success: true });
    });
});

app.get('/api/channel-messages/pinned', (req, res) => {
    const { teamName, channelName } = req.query;

    connection.query(`
        SELECT * FROM channels_messages 
        WHERE pinned = true AND team_name = ? AND channel_name = ?
        ORDER BY created_at DESC 
    `, [teamName, channelName], (err, results) => {
        console.log(results)
        if (err) return res.status(500).json({ error: 'Failed to fetch pinned message' });
        res.json(results || null);
    });
});

// Add endpoint to update group description
app.post("/update-group-description", (req, res) => {
    const { groupId, description } = req.body;
    const userId = req.session.user.id;
    const userName = req.session.user.name;

    checkOwnerForDescriptionUpdate(groupId, description, userId, userName, res);
});

// Helper function to check owner for description update
function checkOwnerForDescriptionUpdate(groupId, description, userId, userName, res) {
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

        updateGroupDescription(groupId, description, userId, userName, res);
    });
}

// Helper function to update group description
function updateGroupDescription(groupId, description, userId, userName, res) {
    // Update group description
    const updateQuery = "UPDATE `groups` SET description = ? WHERE id = ?";
    connection.query(updateQuery, [description, groupId], (err) => {
        if (err) {
            console.error("Error updating group description:", err);
            return res.status(500).json({ error: "Error updating group description." });
        }

        addDescriptionUpdateMessage(groupId, userId, userName, res);
    });
}

// Helper function to add description update message
function addDescriptionUpdateMessage(groupId, userId, userName, res) {
    // Add system message for the description change
    const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
    const systemMessage = `${userName} updated the channel description.`;
    
    connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
        if (err) {
            console.error("Error adding system message:", err);
        }
        
        res.json({ message: "Channel description updated successfully!" });
    });
}

// Add endpoint to remove user from group (for admins)
app.post("/remove-group-member", (req, res) => {
    const { groupId, memberId } = req.body;
    const userId = req.session.user.id;
    const adminName = req.session.user.name;

    checkGroupOwnerForRemoval(groupId, memberId, userId, adminName, res);
});

// Helper function to check group owner for member removal
function checkGroupOwnerForRemoval(groupId, memberId, userId, adminName, res) {
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

        getMemberNameForRemoval(groupId, memberId, userId, adminName, res);
    });
}

// Helper function to get member name for removal
function getMemberNameForRemoval(groupId, memberId, userId, adminName, res) {
    // Get member's name before removing
    const getMemberQuery = "SELECT name FROM user_form WHERE id = ?";
    connection.query(getMemberQuery, [memberId], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }

        const memberName = userResults[0].name;
        addRemovalSystemMessage(groupId, memberId, userId, adminName, memberName, res);
    });
}

// Helper function to add removal system message
function addRemovalSystemMessage(groupId, memberId, userId, adminName, memberName, res) {
    // Add system message before removing the user
    const systemMessageQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
    const systemMessage = `${memberName} was removed from the channel by ${adminName}.`;
    
    connection.query(systemMessageQuery, [groupId, userId, systemMessage], (err) => {
        if (err) {
            console.error("Error adding system message:", err);
        }
        
        removeUserFromGroup(groupId, memberId, res);
    });
}

// Helper function to remove user from group
function removeUserFromGroup(groupId, memberId, res) {
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
}

// Export the app and connection for testing
module.exports = {
    app,
    connection
};