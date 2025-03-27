const express = require('express');
const router = express.Router();
const connection = require('../database/connection');

// Create team
router.post("/create-team", (req, res) => {
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

// Get team ID from name
router.get("/get-team-id", (req, res) => {
    const { teamName } = req.query;
    if (!teamName) return res.status(400).json({ error: "Team name is required." });

    const query = "SELECT id FROM teams WHERE name = ?";
    connection.query(query, [teamName], (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching team ID." });
        if (results.length === 0) return res.status(404).json({ error: "Team not found." });
        res.json({ teamId: results[0].id });
    });
});

// Create channel
router.post("/create-channel", (req, res) => {
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

// Assign user to team
router.post('/assign-user-to-team', (req, res) => {
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

// Assign user to channel
router.post("/assign-user", (req, res) => {
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

// Get teams with members
router.get("/get-teams-with-members", (req, res) => {
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

// Get user's teams
router.get("/get-user-teams", (req, res) => {
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
                    members: new Set(),
                    channels: {}
                };
            }

            if (row.teamMemberName) {
                userTeams[row.teamId].members.add(row.teamMemberName);
            }

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

        Object.values(userTeams).forEach(team => {
            team.members = Array.from(team.members);
            Object.values(team.channels).forEach(channel => {
                channel.members = Array.from(channel.members);
            });
        });

        res.json(Object.values(userTeams));
    });
});

// Get channels for a team
router.post("/get-channels", (req, res) => {
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
});

// Get channel messages
router.post("/get-channel-messages", (req, res) => {
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

// Remove message
router.post("/remove-message", (req, res) => {
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

// Send channel message
router.post("/sendChannelMessage", (req, res) => {
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
});

module.exports = router; 