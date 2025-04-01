const request = require("supertest");
const { connection } = require("../server");
const { app, createTestUser, loginTestUser } = require("./authentication.test");
const crypto = require("crypto");

process.env.NODE_ENV = "test";

// Generate unique test data
const random = crypto.randomBytes(3).toString("hex");
const adminUser = {
    name: `Admin_${random}`,
    email: `admin_${random}@example.com`,
    password: `AdminPass_${random}`,
    user_type: "admin"
};

const regularUser1 = {
    name: `User1_${random}`,
    email: `user1_${random}@example.com`,
    password: `UserPass_${random}`,
    user_type: "user"
};

const regularUser2 = {
    name: `User2_${random}`,
    email: `user2_${random}@example.com`,
    password: `UserPass_${random}`,
    user_type: "user"
};

const groupName = `Group_${random}`;
const groupDescription = `Test group description ${random}`;

let adminId, user1Id, user2Id;
let groupId;
let adminAgent, user1Agent, user2Agent;

// Start the test server before running tests
beforeAll((done) => {
    // First ensure database is set up
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error connecting to database:", err);
            done(err);
            return;
        }
        
        // Register test users first
        Promise.all([
            createTestUser(adminUser),
            createTestUser(regularUser1),
            createTestUser(regularUser2)
        ]).then(() => {
            // Create sessions for each test user
            adminAgent = request.agent(app);
            user1Agent = request.agent(app);
            user2Agent = request.agent(app);
            
            // Login users and store IDs
            return adminAgent.post("/login").send({
                email: adminUser.email,
                password: adminUser.password
            });
        }).then((adminLogin) => {
            adminId = adminLogin.body.user.id;
            return user1Agent.post("/login").send({
                email: regularUser1.email,
                password: regularUser1.password
            });
        }).then((user1Login) => {
            user1Id = user1Login.body.user.id;
            return user2Agent.post("/login").send({
                email: regularUser2.email,
                password: regularUser2.password
            });
        }).then((user2Login) => {
            user2Id = user2Login.body.user.id;
            done();
        }).catch(error => {
            console.error("Error during setup:", error);
            done(error);
        });
    });
}, 30000); // Increased timeout to 30 seconds

// Clean up after all tests
afterAll((done) => {
    try {
        // Delete group messages
        connection.query(
            "DELETE FROM group_messages WHERE group_id = ?",
            [groupId],
            (err) => {
                if (err) console.error("Error deleting group messages:", err);
                
                // Delete group membership
                connection.query(
                    "DELETE FROM group_members WHERE group_id = ?",
                    [groupId],
                    (err) => {
                        if (err) console.error("Error deleting group members:", err);
                        
                        // Delete group requests
                        connection.query(
                            "DELETE FROM group_requests WHERE group_id = ?",
                            [groupId],
                            (err) => {
                                if (err) console.error("Error deleting group requests:", err);
                                
                                // Delete group
                                connection.query(
                                    "DELETE FROM `groups` WHERE name = ?",
                                    [groupName],
                                    (err) => {
                                        if (err) console.error("Error deleting group:", err);
                                        
                                        // Delete test users
                                        connection.query(
                                            "DELETE FROM user_form WHERE email IN (?, ?, ?)",
                                            [adminUser.email, regularUser1.email, regularUser2.email],
                                            (err) => {
                                                if (err) console.error("Error deleting test users:", err);
                                                done();
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error("Error during group tests cleanup:", error);
        done(error);
    }
}, 30000); // Increased timeout for cleanup

describe("Group Messaging API Tests", () => {
    test("Admin can create a group", async () => {
        const res = await adminAgent.post("/create-group").send({
            name: groupName,
            description: groupDescription
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Group created successfully!");
        expect(res.body).toHaveProperty("groupId");
        
        groupId = res.body.groupId;
    });
    
    test("Admin can see their created group", async () => {
        const res = await adminAgent.get("/get-groups");
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        const createdGroup = res.body.find(group => group.name === groupName);
        expect(createdGroup).toBeDefined();
        expect(createdGroup.id).toBe(groupId);
        expect(createdGroup.description).toBe(groupDescription);
    });
    
    test("Admin can add user to group", async () => {
        const res = await adminAgent.post("/add-user").send({
            groupId,
            username: regularUser1.name
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "User added successfully!");
    });
    
    test("User can request to join a group", async () => {
        const res = await user2Agent.post("/request-join").send({
            groupId
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Request to join sent successfully!");
    });
    
    test("Admin can view join requests", async () => {
        const res = await adminAgent.get(`/group-requests/${groupId}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        const request = res.body.find(req => req.name === regularUser2.name);
        expect(request).toBeDefined();
        expect(request.id).toBe(user2Id);
    });
    
    test("Admin can approve join requests", async () => {
        const res = await adminAgent.post("/approve-user").send({
            groupId,
            userId: user2Id
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "User added successfully!");
    });
    
    test("Group members are correctly listed", async () => {
        const res = await adminAgent.get(`/group-members/${groupId}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(3); // Admin + 2 users
        
        const memberNames = res.body.map(member => member.name);
        expect(memberNames).toContain(adminUser.name);
        expect(memberNames).toContain(regularUser1.name);
        expect(memberNames).toContain(regularUser2.name);
    });
    
    test("Admin can update group description", async () => {
        const newDescription = `Updated description ${random}`;
        const res = await adminAgent.post("/update-group-description").send({
            groupId,
            description: newDescription
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Channel description updated successfully!");
        
        // Verify the description was updated
        const groupsRes = await adminAgent.get("/get-groups");
        const updatedGroup = groupsRes.body.find(group => group.id === groupId);
        expect(updatedGroup.description).toBe(newDescription);
    });
    
    test("User can view group messages", async () => {
        const res = await user1Agent.get(`/group-messages/${groupId}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        // There should be system messages from user creation and addition
        const systemMessages = res.body.filter(msg => msg.is_system_message === 1);
        expect(systemMessages.length).toBeGreaterThan(0);
    });
    
    test("Regular user cannot remove another user from group", async () => {
        const res = await user1Agent.post("/remove-group-member").send({
            groupId,
            memberId: user2Id
        });
        
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty("error", "Only the channel owner can remove members.");
    });
    
    test("Admin can remove user from group", async () => {
        const res = await adminAgent.post("/remove-group-member").send({
            groupId,
            memberId: user2Id
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Member removed successfully!");
        
        // Verify user was removed
        const membersRes = await adminAgent.get(`/group-members/${groupId}`);
        const memberIds = membersRes.body.map(member => member.id);
        expect(memberIds).not.toContain(user2Id);
    });
    
    test("User can leave group", async () => {
        const res = await user1Agent.post("/leave-group").send({
            groupId
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "You have left the group.");
        
        // Verify user was removed
        const membersRes = await adminAgent.get(`/group-members/${groupId}`);
        const memberIds = membersRes.body.map(member => member.id);
        expect(memberIds).not.toContain(user1Id);
    });
    
    test("Group owner cannot leave their own group", async () => {
        const res = await adminAgent.post("/leave-group").send({
            groupId
        });
        
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty("error", "As the owner, you cannot leave your own channel. You can delete it instead.");
    });
}); 