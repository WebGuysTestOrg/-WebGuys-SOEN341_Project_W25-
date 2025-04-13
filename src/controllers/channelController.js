const { pool } = require('../config/db');

const channelController = {
    // Create a new channel
    createChannel : async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
    
            const { channelName, teamId } = req.body;
            const userId = req.session.user.id;
    
            if (!channelName || !teamId) {
                return res.status(400).json({ error: "Channel Name and Team ID are required." });
            }
    
            const checkMembershipQuery = `
                SELECT t.created_by AS creatorId, ut.user_id 
                FROM teams t
                LEFT JOIN user_teams ut ON t.id = ut.team_id
                WHERE t.id = ? AND (t.created_by = ? OR ut.user_id = ?)`;
    
            const [results] = await pool.promise().query(checkMembershipQuery, [teamId, userId, userId]);
    
            if (results.length === 0) {
                return res.status(403).json({ error: "You must be the creator or a member of the team to create a channel." });
            }
    
            const teamCreatorId = results[0].creatorId;
    
            const insertChannelQuery = "INSERT INTO channels (name, team_id) VALUES (?, ?)";
            const [channelResult] = await pool.promise().query(insertChannelQuery, [channelName, teamId]);
            const channelId = channelResult.insertId;
    
            const insertUserChannelQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";
            await pool.promise().query(insertUserChannelQuery, [userId, channelId]);
    
            if (teamCreatorId !== userId) {
                await pool.promise().query(insertUserChannelQuery, [teamCreatorId, channelId]);
            }
    
            res.json({ message: "Channel created successfully" });
        } catch (err) {
            console.error("Error creating channel:", err);
            res.status(500).json({ error: "An error occurred while creating the channel" });
        }
    },

    // Get channels for a specific team
    getChannels: async (req, res) => {
        try {
            // FIX HERE -> check body first, fallback to params
            const teamId = req.body.teamId || req.params.teamId;
    
            if (!teamId) {
                return res.status(400).json({ error: "Team ID is required." });
            }
    
            const channelQuery = "SELECT name FROM channels WHERE team_id = ?";
            const results = await query(channelQuery, [teamId]);
    
            if (results.length === 0) {
                return res.status(404).json({ error: "No channels found for this team." });
            }
    
            const channelNames = results.map(row => row.name);
            res.json({ channels: channelNames });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }
    },

    // Get channels for the current user
    getUserChannels: async (req, res) => {
        try {
            if (!req.session?.user) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const userId = req.session.user.id;
            const sqlQuery = `
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

            const results = await query(sqlQuery, [userId]);
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
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Error fetching user channels." });
        }
    },

    // Assign a user to a channel
    assignUser: async (req, res) => {
        const { teamId, channelName, userName } = req.body;

        if (!teamId || !channelName || !userName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        try {
            // Find user ID
            const userQuery = "SELECT id FROM user_form WHERE name = ?";
            const userResults = await query(userQuery, [userName]);
            
            if (userResults.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            
            const userId = userResults[0].id;

            // Check team membership
            const teamMemberQuery = "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?";
            const teamResults = await query(teamMemberQuery, [teamId, userId]);
            
            if (teamResults.length === 0) {
                return res.status(400).json({ error: "User must be a team member first" });
            }

            // Find channel ID
            const channelQuery = "SELECT id FROM channels WHERE team_id = ? AND name = ?";
            const channelResults = await query(channelQuery, [teamId, channelName]);
            
            if (channelResults.length === 0) {
                return res.status(404).json({ error: "Channel not found" });
            }
            
            const channelId = channelResults[0].id;

            // Check existing channel membership
            const channelMemberQuery = "SELECT * FROM user_channels WHERE channel_id = ? AND user_id = ?";
            const memberResults = await query(channelMemberQuery, [channelId, userId]);
            
            if (memberResults.length > 0) {
                return res.status(400).json({ error: "User is already a member of this channel" });
            }

            // Add user to channel
            const insertQuery = "INSERT INTO user_channels (channel_id, user_id) VALUES (?, ?)";
            await query(insertQuery, [channelId, userId]);

            // Get updated members list
            const getUpdatedMembersQuery = `
                SELECT uf.name 
                FROM user_channels uc 
                JOIN user_form uf ON uc.user_id = uf.id 
                WHERE uc.channel_id = ?
            `;
            const updatedMembers = await query(getUpdatedMembersQuery, [channelId]);
            const memberNames = updatedMembers.map(m => m.name);
            
            res.json({ 
                success: true, 
                message: "User added to channel successfully",
                updatedMembers: memberNames
            });
        } catch (error) {
            console.error("Server error:", error);
            res.status(500).json({ error: error.message || "Internal server error" });
        }
    },

    // Get messages for a specific channel
    getChannelMessages: async (req, res) => {
        try {
            const { teamName, channelName } = req.body;

            if (!teamName || !channelName) {
                return res.status(400).json({ error: "Team name and channel name are required." });
            }

            const sqlQuery = `
                SELECT id, sender, text, quoted_message FROM channels_messages 
                WHERE team_name = ? AND channel_name = ? 
                ORDER BY created_at ASC
            `;

            const results = await query(sqlQuery, [teamName, channelName]);
            const formattedResults = results.map(msg => ({
                id: msg.id,
                sender: msg.sender,
                text: msg.text,
                quoted: msg.quoted_message
            }));

            res.json(formattedResults);
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Internal Server Error: Database query failed." });
        }
    },

    // Send a message to a channel
    sendChannelMessage: async (req, res) => {
        try {
            const { teamName, channelName, sender, text, quoted } = req.body;

            if (!teamName || !channelName || !sender || !text) {
                return res.status(400).json({ error: "All fields are required." });
            }

            const sqlQuery = `
                INSERT INTO channels_messages (team_name, channel_name, sender, text, quoted_message) 
                VALUES (?, ?, ?, ?, ?)
            `;

            await query(sqlQuery, [teamName, channelName, sender, text, quoted]);
            res.json({ success: true });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Failed to save message." });
        }
    },

    // Remove a message from a channel
    removeMessage: async (req, res) => {
        try {
            const { messageId } = req.body;

            if (!messageId) {
                return res.status(400).json({ error: "Message ID is required." });
            }

            const sqlQuery = `
                UPDATE channels_messages
                SET text = 'Removed by Moderator'
                WHERE id = ?
            `;

            await query(sqlQuery, [messageId]);
            res.json({ success: true });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).json({ error: "Database update failed." });
        }
    }
};

module.exports = channelController; 