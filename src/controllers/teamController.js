const { connection } = require('../config/db');
const util = require('util');

// Promisify connection methods
const query = util.promisify(connection.query).bind(connection);
const beginTransaction = util.promisify(connection.beginTransaction).bind(connection);
const commit = util.promisify(connection.commit).bind(connection);
const rollback = util.promisify(connection.rollback).bind(connection);

const teamController = {
    // Create a new team
    createTeam: async (req, res) => {
        try {
            if (!req.session?.user || req.session.user.user_type !== "admin") {
                return res.status(403).json({ error: "Only Super Admin can create teams." });
            }

            const { teamName } = req.body;
            const createdBy = req.session.user.id;

            if (!teamName) {
                return res.status(400).json({ error: "Team name is required." });
            }

            const insertTeamQuery = "INSERT INTO teams (name, created_by) VALUES (?, ?)";
            const result = await query(insertTeamQuery, [teamName, createdBy]);
            const teamId = result.insertId;

            const insertUserTeamQuery = "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)";
            await query(insertUserTeamQuery, [createdBy, teamId]);
            
            res.json({ message: "Team created successfully!", teamName });
        } catch (err) {
            console.error("Error creating team:", err);
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Team name already exists!" });
            }
            res.status(500).json({ error: "Error creating team." });
        }
    },

    // Delete a team
    deleteTeam: async (req, res) => {
        try {
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
            const results = await query(checkTeamCreatorQuery, [teamId]);

            if (results.length === 0) {
                return res.status(404).json({ error: "Team not found." });
            }

            const creatorId = results[0].created_by;

            // Only allow team creator or admin to delete the team
            if (creatorId !== userId && req.session.user.user_type !== 'admin') {
                return res.status(403).json({ error: "Only the team creator or an admin can delete a team." });
            }

            // Get all channels in this team
            const getChannelsQuery = "SELECT id FROM channels WHERE team_id = ?";
            const channelResults = await query(getChannelsQuery, [teamId]);
            
            // Extract channel IDs
            const channelIds = channelResults.map(channel => channel.id);

            // Begin transaction for the multi-step deletion
            await beginTransaction();

            try {
                // Delete channel messages for this team
                const deleteMessagesQuery = "DELETE FROM channels_messages WHERE team_name = (SELECT name FROM teams WHERE id = ?)";
                await query(deleteMessagesQuery, [teamId]);

                // Delete user_channels entries if there are channels
                if (channelIds.length > 0) {
                    const deleteUserChannelsQuery = "DELETE FROM user_channels WHERE channel_id IN (?)";
                    await query(deleteUserChannelsQuery, [channelIds]);
                }

                // Delete channels
                const deleteChannelsQuery = "DELETE FROM channels WHERE team_id = ?";
                await query(deleteChannelsQuery, [teamId]);

                // Delete user_teams entries
                const deleteUserTeamsQuery = "DELETE FROM user_teams WHERE team_id = ?";
                await query(deleteUserTeamsQuery, [teamId]);

                // Finally delete the team
                const deleteTeamQuery = "DELETE FROM teams WHERE id = ?";
                await query(deleteTeamQuery, [teamId]);

                // Commit the transaction
                await commit();
                res.json({ message: "Team and all associated channels successfully deleted." });
            } catch (err) {
                // Rollback transaction on error
                await rollback();
                console.error("Error during team deletion transaction:", err);
                res.status(500).json({ error: err.message || "Error completing deletion." });
            }
        } catch (err) {
            console.error("Error deleting team:", err);
            res.status(500).json({ error: err.message || "Error deleting team." });
        }
    },

    // Get all teams with their members
    getTeamsWithMembers: async (req, res) => {
        try {
            const sqlquery = `
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

            const results = await query(sqlquery);
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
        } catch (err) {
            console.error("Error fetching teams:", err);
            res.status(500).json({ error: "Error fetching teams." });
        }
    },

    // Get teams for a specific user
    getUserTeams: async (req, res) => {
        try {
            if (!req.session?.user) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const userId = req.session.user.id;

            const sqlQuery = `
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

            const results = await query(sqlQuery, [userId]);
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
        } catch (err) {
            console.error("Error fetching user teams:", err);
            res.status(500).json({ error: "Error fetching user teams." });
        }
    },

    // Assign a user to a team
    assignUserToTeam: async (req, res) => {
        try {
            const { teamId, userName } = req.body;

            if (!teamId || !userName) {
                return res.status(400).json({ error: "Team ID and User Name are required." });
            }

            // Check if team exists
            const checkTeamQuery = "SELECT * FROM teams WHERE id = ?";
            const teamResults = await query(checkTeamQuery, [teamId]);
            
            if (teamResults.length === 0) {
                return res.status(400).json({ error: "Team not found." });
            }

            // Check if user exists
            const checkUserQuery = "SELECT id FROM user_form WHERE name = ?";
            const userResults = await query(checkUserQuery, [userName]);
            
            if (userResults.length === 0) {
                return res.status(400).json({ error: "User not found." });
            }

            const userId = userResults[0].id;

            // Check if user is already in team
            const checkUserInTeamQuery = "SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?";
            const existingResults = await query(checkUserInTeamQuery, [userId, teamId]);
            
            if (existingResults.length > 0) {
                return res.status(400).json({ error: "User already assigned to this team." });
            }

            // Assign user to team
            const assignUserQuery = "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)";
            await query(assignUserQuery, [userId, teamId]);
            
            res.json({ message: "User successfully assigned to the team." });
        } catch (err) {
            console.error("Error assigning user to team:", err);
            res.status(500).json({ error: "Error assigning user to team." });
        }
    },

    // Remove a member from a team
    removeTeamMember: async (req, res) => {
        try {
            if (!req.session?.user) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { teamId, userId: memberIdToRemove } = req.body;
            const userId = req.session.user.id;

            if (!teamId || !memberIdToRemove) {
                return res.status(400).json({ error: "Team ID and User ID are required." });
            }

            // Verify that this user is the team creator or an admin
            const checkTeamCreatorQuery = "SELECT created_by FROM teams WHERE id = ?";
            const results = await query(checkTeamCreatorQuery, [teamId]);

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

            // Check if user is in the team
            const checkUserInTeamQuery = "SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?";
            const userTeamResults = await query(checkUserInTeamQuery, [memberIdToRemove, teamId]);

            if (userTeamResults.length === 0) {
                return res.status(404).json({ error: "User is not a member of this team." });
            }

            // Begin transaction for the multi-step removal
            await beginTransaction();

            try {
                // Get all channels in this team
                const getChannelsQuery = "SELECT id FROM channels WHERE team_id = ?";
                const channelResults = await query(getChannelsQuery, [teamId]);

                // Extract channel IDs
                const channelIds = channelResults.map(channel => channel.id);

                // Remove user from all channels in the team if there are any
                if (channelIds.length > 0) {
                    const deleteUserChannelsQuery = "DELETE FROM user_channels WHERE user_id = ? AND channel_id IN (?)";
                    await query(deleteUserChannelsQuery, [memberIdToRemove, channelIds]);
                }

                // Remove user from team
                const deleteUserTeamQuery = "DELETE FROM user_teams WHERE user_id = ? AND team_id = ?";
                await query(deleteUserTeamQuery, [memberIdToRemove, teamId]);

                // Commit the transaction
                await commit();
                res.json({ message: "User successfully removed from team and all associated channels." });
            } catch (err) {
                // Rollback transaction on error
                await rollback();
                console.error("Error during team member removal transaction:", err);
                res.status(500).json({ error: "Error completing removal, transaction failed." });
            }
        } catch (err) {
            console.error("Error removing team member:", err);
            res.status(500).json({ error: "Error removing team member." });
        }
    },
    // Get Team ID from Team Name
getTeamIdFromName: async (req, res) => {
    try {
        const { teamName } = req.body;

        if (!teamName) {
            return res.status(400).json({ error: "Team name is required." });
        }

        const sql = "SELECT id FROM teams WHERE name = ?";
        const results = await query(sql, [teamName]);

        if (results.length === 0) {
            return res.status(404).json({ error: "Team not found." });
        }

        res.json({ teamId: results[0].id });
    } catch (err) {
        console.error("Error fetching team ID:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
},

};

module.exports = teamController; 