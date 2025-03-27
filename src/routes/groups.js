const express = require('express');
const router = express.Router();
const connection = require('../database/connection');

// Create group
router.post("/create-group", (req, res) => {
    const { name, description } = req.body;
    const createdBy = req.session.user.id;

    if (!name || !description) {
        return res.status(400).json({ error: "Group name and description are required." });
    }

    const query = "INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)";
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
            res.json({ message: "Group created successfully!", groupId });
        });
    });
});

// Add user to group
router.post("/add-user", (req, res) => {
    const { groupId, username } = req.body;

    const userQuery = "SELECT id FROM user_form WHERE name = ?";
    connection.query(userQuery, [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: "User not found." });
        }
        
        const userId = results[0].id;

        const checkQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
        connection.query(checkQuery, [groupId, userId], (err, checkResults) => {
            if (err) return res.status(500).json({ error: "Database error." });
            if (checkResults.length > 0) return res.status(400).json({ error: "User is already a member." });

            const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
            connection.query(insertQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: "Error adding user to group." });
                res.json({ message: "User added successfully!" });
            });
        });
    });
});

// Get all groups
router.get("/get-groups", (req, res) => {
    const query = "SELECT id, name, description FROM groups ORDER BY created_at DESC";
    connection.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching groups:", err);
            return res.status(500).json({ error: "Error fetching groups." });
        }
        res.json(results);
    });
});

// Get group members
router.get("/group-members/:groupId", (req, res) => {
    const { groupId } = req.params;

    const query = `
        SELECT u.id, u.name, g.created_by AS owner_id
        FROM group_members gm 
        JOIN user_form u ON gm.user_id = u.id 
        JOIN groups g ON g.id = gm.group_id
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

// Get group owner
router.get("/group-owner/:groupId", (req, res) => {
    const { groupId } = req.params;
    
    const query = "SELECT created_by AS owner_id FROM groups WHERE id = ?";
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

// Get group join requests
router.get("/group-requests/:groupId", (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user ? req.session.user.id : null;

    if (!userId) {
        console.error("Unauthorized request: No user ID found.");
        return res.status(401).json({ error: "Unauthorized request." });
    }

    const checkOwnerQuery = "SELECT created_by FROM groups WHERE id = ?";
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

// Request to join group
router.post("/request-join", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;

    if (!userId) {
        return res.status(401).json({ error: "You must be logged in to request to join a group." });
    }

    const checkMembershipQuery = "SELECT * FROM group_members WHERE group_id = ? AND user_id = ?";
    connection.query(checkMembershipQuery, [groupId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error while checking membership." });
        if (results.length > 0) return res.status(400).json({ error: "You are already a member of this group." });

        const checkOwnerQuery = "SELECT created_by FROM groups WHERE id = ?";
        connection.query(checkOwnerQuery, [groupId], (err, ownerResults) => {
            if (err) return res.status(500).json({ error: "Database error while checking owner." });

            const isOwner = ownerResults.length > 0 && ownerResults[0].created_by === userId;
            if (isOwner) return res.status(400).json({ error: "You are the group owner and cannot request to join." });

            const checkRequestQuery = "SELECT * FROM group_requests WHERE group_id = ? AND user_id = ?";
            connection.query(checkRequestQuery, [groupId, userId], (err, requestResults) => {
                if (err) return res.status(500).json({ error: "Database error while checking join request." });
                if (requestResults.length > 0) return res.status(400).json({ error: "You have already requested to join this group." });

                const insertRequestQuery = "INSERT INTO group_requests (group_id, user_id) VALUES (?, ?)";
                connection.query(insertRequestQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: "Error submitting join request." });
                    res.json({ message: "Request to join sent successfully!" });
                });
            });
        });
    });
});

// Approve user join request
router.post("/approve-user", (req, res) => {
    const { groupId, userId } = req.body;

    const deleteQuery = "DELETE FROM group_requests WHERE group_id = ? AND user_id = ?";
    connection.query(deleteQuery, [groupId, userId], (err) => {
        if (err) return res.status(500).json({ error: "Error processing request." });

        const insertQuery = "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)";
        connection.query(insertQuery, [groupId, userId], (err) => {
            if (err) return res.status(500).json({ error: "Error adding user to group." });
            res.json({ message: "User added successfully!" });
        });
    });
});

// Leave group
router.post("/leave-group", (req, res) => {
    const { groupId } = req.body;
    const userId = req.session.user.id;

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

// Get group messages
router.get("/group-messages/:groupId", (req, res) => {
    const { groupId } = req.params;

    const query = `
        SELECT u.name AS sender, gm.text 
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

module.exports = router; 