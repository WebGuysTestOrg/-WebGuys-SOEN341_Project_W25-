const request = require("supertest");
const { connection } = require("../server");
const { app, createTestUser, loginTestUser } = require("./authentication.test");
const crypto = require("crypto");
process.env.NODE_ENV = "test";

// Server reference
let server;

// Generate unique test data
const randomSuffix = crypto.randomBytes(3).toString("hex");
const adminUser = {
    name: `AdminUser_${randomSuffix}`,
    email: `admin_${randomSuffix}@example.com`,
    password: `AdminPass_${randomSuffix}`,
    user_type: "admin"
};

const regularUser = {
    name: `RegUser_${randomSuffix}`,
    email: `user_${randomSuffix}@example.com`,
    password: `UserPass_${randomSuffix}`,
    user_type: "user"
};

const teamName = `Team_${randomSuffix}`;
const channelName = `Channel_${randomSuffix}`;

let teamId;
let adminId;
let userId;

// Start the test server before running tests
beforeAll((done) => {
    // First ensure database is set up
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error connecting to database:", err);
            done(err);
            return;
        }
        
        // No need to create a new server, use app directly
        // Register test users first
        Promise.all([
            createTestUser(adminUser),
            createTestUser(regularUser)
        ]).then(() => {
            // Get user IDs by logging in
            return loginTestUser(adminUser.email, adminUser.password);
        }).then((adminLogin) => {
            adminId = adminLogin.body.user.id;
            return loginTestUser(regularUser.email, regularUser.password);
        }).then((userLogin) => {
            userId = userLogin.body.user.id;
            done();
        }).catch(error => {
            console.error("Error during setup:", error);
            done(error);
        });
    });
}, 30000);

// Clean up after all tests
afterAll((done) => {
    try {
        // Delete the test channel if it exists
        connection.query(
            "DELETE FROM channels WHERE name = ?",
            [channelName],
            (err) => {
                if (err) console.error("Error deleting test channel:", err);
                
                // Delete test user_channels entries if they exist
                connection.query(
                    "DELETE FROM user_channels WHERE user_id IN (?, ?)",
                    [adminId, userId],
                    (err) => {
                        if (err) console.error("Error deleting user_channels:", err);
                        
                        // Delete team associations
                        connection.query(
                            "DELETE FROM user_teams WHERE user_id IN (?, ?)",
                            [adminId, userId],
                            (err) => {
                                if (err) console.error("Error deleting user_teams:", err);
                                
                                // Delete the test team if it exists
                                connection.query(
                                    "DELETE FROM teams WHERE name = ?",
                                    [teamName],
                                    (err) => {
                                        if (err) console.error("Error deleting test team:", err);
                                        
                                        // Delete test users
                                        connection.query(
                                            "DELETE FROM user_form WHERE email IN (?, ?)",
                                            [adminUser.email, regularUser.email],
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
        console.error("Error during team tests cleanup:", error);
        done(error);
    }
}, 30000);

describe("Team Management API Tests", () => {
    test("Admin creates a team successfully", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Create team
        const createTeamRes = await agent.post("/create-team").send({ teamName });
        expect(createTeamRes.status).toBe(200);
        expect(createTeamRes.body.message).toBe("Team created successfully!");
        
        // Get team ID
        const teamIdRes = await agent.get(`/get-team-id?teamName=${teamName}`);
        expect(teamIdRes.status).toBe(200);
        teamId = teamIdRes.body.teamId;
        expect(teamId).toBeDefined();
    });
    
    test("Admin assigns regular user to team", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Assign user to team
        const assignRes = await agent.post("/assign-user-to-team").send({
            teamId,
            userName: regularUser.name
        });
        
        expect(assignRes.status).toBe(200);
        expect(assignRes.body.message).toBe("User successfully assigned to the team.");
    });
    
    test("Admin cannot assign the same user to a team twice", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Try to assign the same user again
        const duplicateAssignRes = await agent.post("/assign-user-to-team").send({
            teamId,
            userName: regularUser.name
        });
        
        expect(duplicateAssignRes.status).toBe(400);
        expect(duplicateAssignRes.body).toHaveProperty("error");
        expect(duplicateAssignRes.body.error).toBe("User already assigned to this team.");
    });
    
    test("Admin creates a channel in the team", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Create channel
        const createChannelRes = await agent.post("/create-channel").send({
            channelName,
            teamId
        });
        
        expect(createChannelRes.status).toBe(200);
        expect(createChannelRes.body).toHaveProperty("message");
        expect(createChannelRes.body.message).toContain("Channel created successfully");
    });
    
    test("Admin assigns user to channel", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Assign user to channel
        const assignChannelRes = await agent.post("/assign-user").send({
            teamId,
            channelName,
            userName: regularUser.name
        });
        
        expect(assignChannelRes.status).toBe(200);
        expect(assignChannelRes.body).toHaveProperty("success", true);
        expect(assignChannelRes.body).toHaveProperty("message");
        expect(assignChannelRes.body.message).toBe("User added to channel successfully");
    });
    
    test("User can view teams they are assigned to", async () => {
        const agent = request.agent(app);
        
        // Login as regular user
        await agent.post("/login").send({
            email: regularUser.email,
            password: regularUser.password
        });
        
        // Get user teams
        const teamsRes = await agent.get("/get-user-teams");
        
        expect(teamsRes.status).toBe(200);
        expect(Array.isArray(teamsRes.body)).toBe(true);
        
        // Check if the created team exists in the response
        const foundTeam = teamsRes.body.find(team => team.teamName === teamName);
        expect(foundTeam).toBeDefined();
        expect(foundTeam.teamId.toString()).toBe(teamId.toString());
        
        // Check if the channel exists in the team
        const channelKeys = Object.keys(foundTeam.channels);
        expect(channelKeys.length).toBeGreaterThan(0);
        
        // Find the channel by name
        let foundChannel = false;
        for (const key of channelKeys) {
            if (foundTeam.channels[key].channelName === channelName) {
                foundChannel = true;
                break;
            }
        }
        expect(foundChannel).toBe(true);
    });
    
    test("Admin can view all teams with members", async () => {
        const agent = request.agent(app);
        
        // Login as admin
        await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        
        // Get all teams
        const teamsRes = await agent.get("/get-teams-with-members");
        
        expect(teamsRes.status).toBe(200);
        expect(Array.isArray(teamsRes.body)).toBe(true);
        
        // Check if the created team exists in the response
        const foundTeam = teamsRes.body.find(team => team.teamName === teamName);
        expect(foundTeam).toBeDefined();
        expect(foundTeam.teamId.toString()).toBe(teamId.toString());
        expect(foundTeam.members).toContain(regularUser.name);
        expect(foundTeam.members).toContain(adminUser.name);
    });
});

