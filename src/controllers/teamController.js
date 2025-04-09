const connection = require('../config/db');

const teamController = {
    // Create a new team
    createTeam: (req, res) => {
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
    },

    // Delete a team
    deleteTeam: (req, res) => {
        if (!req.session.user) {
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

                    // Delete channel messages for this team
                    const deleteMessagesQuery = "DELETE FROM channels_messages WHERE team_name = (SELECT name FROM teams WHERE id = ?)";
                    connection.query(deleteMessagesQuery, [teamId], err => {
                        if (err) {
                            console.error("Error deleting team channel messages:", err);
                            return connection.rollback(() => {
                                res.status(500).json({ error: "Error deleting team channel messages." });
                            });
                        }

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

                            // Delete channels
                            const deleteChannelsQuery = "DELETE FROM channels WHERE team_id = ?";
                            connection.query(deleteChannelsQuery, [teamId], err => {
                                if (err) {
                                    console.error("Error deleting channels:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error deleting team channels." });
                                    });
                                }

                                // Delete user_teams entries
                                const deleteUserTeamsQuery = "DELETE FROM user_teams WHERE team_id = ?";
                                connection.query(deleteUserTeamsQuery, [teamId], err => {
                                    if (err) {
                                        console.error("Error deleting user_teams:", err);
                                        return connection.rollback(() => {
                                            res.status(500).json({ error: "Error deleting user team associations." });
                                        });
                                    }

                                    // Finally delete the team
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
                                });
                            });
                        });
                    });
                });
            });
        });
    },

    // Get all teams with their members
    getTeamsWithMembers: (req, res) => {
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
    },

    // Get teams for a specific user
    getUserTeams: (req, res) => {
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
    },

    // Assign a user to a team
    assignUserToTeam: (req, res) => {
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
    },

    // Remove a member from a team
    removeTeamMember: (req, res) => {
        if (!req.session.user) {
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

                // Begin transaction for the multi-step removal
                connection.beginTransaction(err => {
                    if (err) {
                        console.error("Error starting transaction:", err);
                        return res.status(500).json({ error: "Error starting database transaction." });
                    }

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

                        // Remove user from all channels in the team
                        if (channelIds.length > 0) {
                            const deleteUserChannelsQuery = "DELETE FROM user_channels WHERE user_id = ? AND channel_id IN (?)";
                            connection.query(deleteUserChannelsQuery, [memberIdToRemove, channelIds], err => {
                                if (err) {
                                    console.error("Error removing user from channels:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error removing user from team channels." });
                                    });
                                }
                                removeFromTeam();
                            });
                        } else {
                            removeFromTeam();
                        }

                        // Remove user from team
                        function removeFromTeam() {
                            const deleteUserTeamQuery = "DELETE FROM user_teams WHERE user_id = ? AND team_id = ?";
                            connection.query(deleteUserTeamQuery, [memberIdToRemove, teamId], err => {
                                if (err) {
                                    console.error("Error removing user from team:", err);
                                    return connection.rollback(() => {
                                        res.status(500).json({ error: "Error removing user from team." });
                                    });
                                }

                                // Commit the transaction
                                connection.commit(err => {
                                    if (err) {
                                        console.error("Error committing transaction:", err);
                                        return connection.rollback(() => {
                                            res.status(500).json({ error: "Error completing removal, transaction failed." });
                                        });
                                    }

                                    res.json({ message: "User successfully removed from team and all associated channels." });
                                });
                            });
                        }
                    });
                });
            });
        });
    }
};

module.exports = teamController; 