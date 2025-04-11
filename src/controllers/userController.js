const crypto = require('crypto');
const connection = require('../config/db');

// Create a mock promise pool for testing purposes
const promisePool = {
    query: async (sql, params) => {
        return new Promise((resolve, reject) => {
            connection.query(sql, params, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve([results, null]);
                }
            });
        });
    }
};

const userController = {
    // Common functions for all users
    login: async (req, res) => {
        const { email, password } = req.body;
        try {
            const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
            const [results] = await promisePool.query(
                "SELECT * FROM user_form WHERE email = ? AND password = ?",
                [email, hashedPassword]
            );

            if (results.length > 0) {
                const user = results[0];
                req.session.user = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    user_type: user.user_type,
                };

                // Log login time
                await promisePool.query(
                    "INSERT INTO user_activity_log (user_id, name) VALUES (?, ?)",
                    [user.id, user.name]
                );

                const redirectPath = user.user_type === "admin" 
                    ? "/AdminDashboard.html" 
                    : "/UserDashboard.html";

                res.json({ 
                    redirect: redirectPath,
                    user: req.session.user
                });
            } else {
                res.status(401).json({ error: "Invalid email or password." });
            }
        } catch (err) {
            console.error("Login error:", err);
            res.status(500).json({ error: "Server error" });
        }
    },

    logout: async (req, res) => {
        if (!req.session.user) {
            return res.redirect("/Login-Form.html");
        }

        try {
            const userId = req.session.user.id;
            await promisePool.query(
                `UPDATE user_activity_log 
                 SET logout_time = CURRENT_TIMESTAMP 
                 WHERE user_id = ? 
                 ORDER BY login_time DESC 
                 LIMIT 1`,
                [userId]
            );

            req.session.destroy();
            res.redirect("/Login-Form.html");
        } catch (err) {
            console.error("Logout error:", err);
            res.status(500).json({ error: "Error logging out." });
        }
    },

    updatePassword: async (req, res) => {
        const { newPassword, confirmPassword } = req.body;

        if (!req.session.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match!" });
        }

        try {
            const hashedPassword = crypto.createHash("md5").update(newPassword).digest("hex");
            await promisePool.query(
                "UPDATE user_form SET password = ? WHERE id = ?",
                [hashedPassword, req.session.user.id]
            );

            res.status(200).json({ message: "Password updated successfully!" });
        } catch (err) {
            console.error("Password update error:", err);
            res.status(500).json({ error: "Error updating password." });
        }
    },

    // Admin-specific functions
    adminFunctions: {
        createTeam: async (req, res) => {
            const { teamName } = req.body;
            try {
                const [result] = await promisePool.query(
                    "INSERT INTO teams (name, created_by) VALUES (?, ?)",
                    [teamName, req.session.user.id]
                );

                await promisePool.query(
                    "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)",
                    [req.session.user.id, result.insertId]
                );

                res.json({ message: "Team created successfully!", teamName });
            } catch (err) {
                console.error("Team creation error:", err);
                res.status(500).json({ error: "Error creating team" });
            }
        },

        removeMessage: async (req, res) => {
            const { messageId } = req.body;
            try {
                await promisePool.query(
                    "UPDATE channels_messages SET text = 'Removed by Moderator' WHERE id = ?",
                    [messageId]
                );
                res.json({ success: true });
            } catch (err) {
                console.error("Message removal error:", err);
                res.status(500).json({ error: "Error removing message" });
            }
        },

        removeUserFromTeam: async (req, res) => {
            const { teamId, userId } = req.body;
            try {
                const [team] = await promisePool.query(
                    "SELECT created_by FROM teams WHERE id = ?",
                    [teamId]
                );

                if (team[0].created_by === userId) {
                    return res.status(403).json({ 
                        error: "Cannot remove team creator from their own team" 
                    });
                }

                await promisePool.query(
                    "DELETE FROM user_teams WHERE team_id = ? AND user_id = ?",
                    [teamId, userId]
                );

                res.json({ message: "User removed from team successfully" });
            } catch (err) {
                console.error("User removal error:", err);
                res.status(500).json({ error: "Error removing user from team" });
            }
        },

        approveGroupRequest: async (req, res) => {
            const { groupId, userId } = req.body;
            try {
                await promisePool.query(
                    "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?",
                    [groupId, userId]
                );

                await promisePool.query(
                    "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
                    [groupId, userId]
                );

                const [user] = await promisePool.query(
                    "SELECT name FROM user_form WHERE id = ?",
                    [userId]
                );

                await promisePool.query(
                    `INSERT INTO group_messages 
                     (group_id, user_id, text, is_system_message) 
                     VALUES (?, ?, ?, 1)`,
                    [groupId, req.session.user.id, 
                     `${user[0].name}'s request to join was approved by ${req.session.user.name}.`]
                );

                res.json({ message: "User added to group successfully" });
            } catch (err) {
                console.error("Group approval error:", err);
                res.status(500).json({ error: "Error approving group request" });
            }
        },

        updateGroupDescription: async (req, res) => {
            const { groupId, description } = req.body;
            try {
                await promisePool.query(
                    "UPDATE `groups` SET description = ? WHERE id = ?",
                    [description, groupId]
                );

                await promisePool.query(
                    `INSERT INTO group_messages 
                     (group_id, user_id, text, is_system_message) 
                     VALUES (?, ?, ?, 1)`,
                    [groupId, req.session.user.id, 
                     `${req.session.user.name} updated the group description.`]
                );

                res.json({ message: "Group description updated successfully" });
            } catch (err) {
                console.error("Group update error:", err);
                res.status(500).json({ error: "Error updating group description" });
            }
        },

        removeGroupMember: async (req, res) => {
            const { groupId, memberId } = req.body;
            try {
                const [member] = await promisePool.query(
                    "SELECT name FROM user_form WHERE id = ?",
                    [memberId]
                );

                await promisePool.query(
                    `INSERT INTO group_messages 
                     (group_id, user_id, text, is_system_message) 
                     VALUES (?, ?, ?, 1)`,
                    [groupId, req.session.user.id, 
                     `${member[0].name} was removed from the group by ${req.session.user.name}.`]
                );

                await promisePool.query(
                    "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
                    [groupId, memberId]
                );

                res.json({ message: "Member removed successfully" });
            } catch (err) {
                console.error("Member removal error:", err);
                res.status(500).json({ error: "Error removing member" });
            }
        }
    },

    // Normal user functions
    userFunctions: {
        joinTeam: async (req, res) => {
            const { teamId } = req.body;
            try {
                const [existing] = await promisePool.query(
                    "SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?",
                    [teamId, req.session.user.id]
                );

                if (existing.length > 0) {
                    return res.status(400).json({ error: "Already a member of this team" });
                }

                await promisePool.query(
                    "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)",
                    [req.session.user.id, teamId]
                );

                res.json({ message: "Successfully joined team" });
            } catch (err) {
                console.error("Team join error:", err);
                res.status(500).json({ error: "Error joining team" });
            }
        },

        sendMessage: async (req, res) => {
            const { teamName, channelName, text } = req.body;
            try {
                const [access] = await promisePool.query(
                    `SELECT * FROM user_channels uc 
                     JOIN channels c ON uc.channel_id = c.id 
                     JOIN teams t ON c.team_id = t.id 
                     WHERE t.name = ? AND c.name = ? AND uc.user_id = ?`,
                    [teamName, channelName, req.session.user.id]
                );

                if (access.length === 0) {
                    return res.status(403).json({ error: "No access to this channel" });
                }

                await promisePool.query(
                    `INSERT INTO channels_messages 
                     (team_name, channel_name, sender, text) 
                     VALUES (?, ?, ?, ?)`,
                    [teamName, channelName, req.session.user.name, text]
                );

                res.json({ message: "Message sent successfully" });
            } catch (err) {
                console.error("Message send error:", err);
                res.status(500).json({ error: "Error sending message" });
            }
        },

        requestJoinGroup: async (req, res) => {
            const { groupId } = req.body;
            try {
                const [existing] = await promisePool.query(
                    "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?",
                    [groupId, req.session.user.id]
                );

                if (existing.length > 0) {
                    return res.status(400).json({ error: "Already a member of this group" });
                }

                const [request] = await promisePool.query(
                    "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?",
                    [groupId, req.session.user.id]
                );

                if (request.length > 0) {
                    return res.status(400).json({ error: "Already requested to join this group" });
                }

                await promisePool.query(
                    "INSERT INTO group_requests (group_id, user_id) VALUES (?, ?)",
                    [groupId, req.session.user.id]
                );

                res.json({ message: "Join request sent successfully" });
            } catch (err) {
                console.error("Group join request error:", err);
                res.status(500).json({ error: "Error sending join request" });
            }
        },

        leaveGroup: async (req, res) => {
            const { groupId } = req.body;
            try {
                const [group] = await promisePool.query(
                    "SELECT created_by FROM `groups` WHERE id = ?",
                    [groupId]
                );

                if (group[0].created_by === req.session.user.id) {
                    return res.status(403).json({ 
                        error: "As the owner, you cannot leave your own group" 
                    });
                }

                await promisePool.query(
                    `INSERT INTO group_messages 
                     (group_id, user_id, text, is_system_message) 
                     VALUES (?, ?, ?, 1)`,
                    [groupId, req.session.user.id, 
                     `${req.session.user.name} has left the group.`]
                );

                await promisePool.query(
                    "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
                    [groupId, req.session.user.id]
                );

                res.json({ message: "Successfully left the group" });
            } catch (err) {
                console.error("Group leave error:", err);
                res.status(500).json({ error: "Error leaving group" });
            }
        },

        updateStatus: async (req, res) => {
            const { status } = req.body;
            try {
                await promisePool.query(
                    "UPDATE user_form SET status = ? WHERE id = ?",
                    [status, req.session.user.id]
                );

                req.app.get('io').emit('userStatusUpdate', {
                    userId: req.session.user.id,
                    status: status
                });

                res.json({ message: "Status updated successfully" });
            } catch (err) {
                console.error("Status update error:", err);
                res.status(500).json({ error: "Error updating status" });
            }
        },

        getUserTeams: async (req, res) => {
            try {
                const [teams] = await promisePool.query(
                    `SELECT t.id, t.name, t.created_by 
                     FROM teams t 
                     JOIN user_teams ut ON t.id = ut.team_id 
                     WHERE ut.user_id = ?`,
                    [req.session.user.id]
                );

                res.json(teams);
            } catch (err) {
                console.error("Teams fetch error:", err);
                res.status(500).json({ error: "Error fetching teams" });
            }
        },

        getUserChannels: async (req, res) => {
            try {
                const [channels] = await promisePool.query(
                    `SELECT c.id, c.name, t.name as team_name 
                     FROM channels c 
                     JOIN user_channels uc ON c.id = uc.channel_id 
                     JOIN teams t ON c.team_id = t.id 
                     WHERE uc.user_id = ?`,
                    [req.session.user.id]
                );

                res.json(channels);
            } catch (err) {
                console.error("Channels fetch error:", err);
                res.status(500).json({ error: "Error fetching channels" });
            }
        }
    }
};

module.exports = userController; 