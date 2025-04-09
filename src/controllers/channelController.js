const connection = require('../config/db');

const channelController = {
    // Create a new channel
    createChannel: (req, res) => {
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
    },

    // Get channels for a specific team
    getChannels: (req, res) => {
        const { teamId } = req.body;
        if (!teamId) {
            return res.status(400).json({ error: "Team ID is required." });
        }

        const query = "SELECT name FROM channels WHERE team_id = ?";
        connection.query(query, [teamId], (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Internal Server Error: Database query failed." });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: "No channels found for this team." });
            }
            
            const channelNames = results.map(row => row.name);
            res.json({ channels: channelNames });
        });
    },

    // Get channels for the current user
    getUserChannels: (req, res) => {
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
                user_channels uc
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
        });
    },

    // Assign a user to a channel
    assignUser: (req, res) => {
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
    },

    // Get messages for a specific channel
    getChannelMessages: (req, res) => {
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
    },

    // Send a message to a channel
    sendChannelMessage: (req, res) => {
        const { teamName, channelName, sender, text, quoted } = req.body;

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
    },

    // Remove a message from a channel
    removeMessage: (req, res) => {
        const { messageId } = req.body;

        if (!messageId) {
            return res.status(400).json({ error: "Message ID is required." });
        }

        const query = `
            UPDATE channels_messages
            SET text = 'Removed by Moderator'
            WHERE id = ?
        `;

        connection.query(query, [messageId], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Database update failed." });
            }

            res.json({ success: true });
        });
    }
};

module.exports = channelController; 