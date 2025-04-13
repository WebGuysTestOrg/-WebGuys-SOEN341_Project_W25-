const { connection } = require('../config/db');

const groupController = {

    // Create a Group
    createGroup: (req, res) => {
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
    },

    getGroups: (req, res) => {
        const query = "SELECT id, name, description FROM `groups` ORDER BY created_at DESC";
        connection.query(query, (err, results) => {
            if (err) {
                console.error("Error fetching groups:", err);
                return res.status(500).json({ error: "Error fetching groups." });
            }
            res.json(results);
        });
    },

    getGroupMembers: (req, res) => {
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
    },

    getGroupOwner: (req, res) => {
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
    },
// Request to Join Group
    requestJoin: (req, res) => {
        const { groupId } = req.body;
        const userId = req.session.user.id;

        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const checkMembershipQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
        connection.query(checkMembershipQuery, [groupId, userId], (err, results) => {
            if (err) return res.status(500).json({ error: "DB error." });
            if (results.length > 0) return res.status(400).json({ error: "Already a member." });

            const checkRequestQuery = "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?";
            connection.query(checkRequestQuery, [groupId, userId], (err, requestResults) => {
                if (err) return res.status(500).json({ error: "DB error." });
                if (requestResults.length > 0) return res.status(400).json({ error: "Request already sent." });

                const insertQuery = "INSERT INTO group_requests (group_id, user_id) VALUES (?, ?)";
                connection.query(insertQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: "Failed to send request." });
                    res.json({ message: "Request sent successfully!" });
                });
            });
        });
    },


    // Approve User to Group
    approveUser: (req, res) => {
        const { groupId, userId } = req.body;
        const approverName = req.session.user.name;
        const approverId = req.session.user.id;

        const deleteRequestQuery = "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?";
        connection.query(deleteRequestQuery, [groupId, userId], (err) => {
            if (err) return res.status(500).json({ error: "DB error." });

            const addMemberQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
            connection.query(addMemberQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: "DB error." });

                const systemMsg = `${req.body.username} was approved by ${approverName}`;
                const msgQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                connection.query(msgQuery, [groupId, approverId, systemMsg], (err) => {
                    if (err) console.error("Error adding system message:", err);
                    res.json({ message: "User approved successfully!" });
                });
            });
        });
    },


    // Leave Group
    leaveGroup: (req, res) => {
        const { groupId } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;

        const ownerCheckQuery = "SELECT created_by FROM `groups` WHERE id = ?";
        connection.query(ownerCheckQuery, [groupId], (err, results) => {
            if (err) return res.status(500).json({ error: "DB error." });
            if (results.length === 0) return res.status(404).json({ error: "Group not found." });

            if (results[0].created_by === userId) {
                return res.status(403).json({ error: "Owner cannot leave their own group." });
            }

            const systemMsg = `${userName} has left the group.`;
            const msgQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
            connection.query(msgQuery, [groupId, userId, systemMsg], (err) => {
                if (err) console.error("Error adding system message:", err);

                const removeQuery = "DELETE FROM group_members WHERE group_id = ? AND user_id = ?";
                connection.query(removeQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: "Failed to leave group." });
                    res.json({ message: "You have left the group." });
                });
            });
        });
    },


    // Update Group Description
    updateGroupDescription: (req, res) => {
        const { groupId, description } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;

        const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
        connection.query(checkOwnerQuery, [groupId], (err, results) => {
            if (err) return res.status(500).json({ error: "DB error." });
            if (results.length === 0) return res.status(404).json({ error: "Group not found." });

            if (results[0].created_by !== userId) {
                return res.status(403).json({ error: "Only owner can update description." });
            }

            const updateQuery = "UPDATE `groups` SET description = ? WHERE id = ?";
            connection.query(updateQuery, [description, groupId], (err) => {
                if (err) return res.status(500).json({ error: "Failed to update description." });

                const systemMsg = `${userName} updated the group description.`;
                const msgQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                connection.query(msgQuery, [groupId, userId, systemMsg], (err) => {
                    if (err) console.error("Error adding system message:", err);
                    res.json({ message: "Description updated successfully!" });
                });
            });
        });
    },


    // Remove Member from Group
    removeGroupMember: (req, res) => {
        const { groupId, memberId } = req.body;
        const userId = req.session.user.id;
        const adminName = req.session.user.name;

        const checkOwnerQuery = "SELECT created_by FROM `groups` WHERE id = ?";
        connection.query(checkOwnerQuery, [groupId], (err, results) => {
            if (err) return res.status(500).json({ error: "DB error." });
            if (results.length === 0) return res.status(404).json({ error: "Group not found." });

            if (results[0].created_by !== userId) {
                return res.status(403).json({ error: "Only owner can remove members." });
            }

            const getNameQuery = "SELECT name FROM user_form WHERE id = ?";
            connection.query(getNameQuery, [memberId], (err, userResults) => {
                if (err) return res.status(500).json({ error: "DB error." });
                if (userResults.length === 0) return res.status(404).json({ error: "User not found." });

                const memberName = userResults[0].name;
                const systemMsg = `${memberName} was removed by ${adminName}.`;

                const msgQuery = "INSERT INTO group_messages (group_id, user_id, text, is_system_message) VALUES (?, ?, ?, 1)";
                connection.query(msgQuery, [groupId, userId, systemMsg], (err) => {
                    if (err) console.error("Error adding system message:", err);

                    const removeQuery = "DELETE FROM group_members WHERE group_id = ? AND user_id = ?";
                    connection.query(removeQuery, [groupId, memberId], (err) => {
                        if (err) return res.status(500).json({ error: "Failed to remove user." });
                        res.json({ message: "Member removed successfully!" });
                    });
                });
            });
        });
    },
};

module.exports = groupController;