const crypto = require("crypto");
const sharedSession = require("express-socket.io-session"); 
const { connection } = require('./config/db');
const { app, sessionMiddleware } = require('./app');
const { initializeSocketServer } = require('./socket/utils/socketManager');
  

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
    
    // Initialize Socket.IO with the Express server
    const io = initializeSocketServer(expressServer, sessionMiddleware, sharedSession, connection);
}

// =============================================
// AUTHENTICATION AND USER MANAGEMENT ROUTES
// =============================================

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
        ORDER BY created_at DESC LIMIT 1
    `, [teamName, channelName], (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch pinned message' });
        res.json(results[0] || null);
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