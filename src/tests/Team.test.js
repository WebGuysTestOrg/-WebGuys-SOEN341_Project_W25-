const request = require("supertest");
const { app, connection } = require("../server"); // Use the same server
const crypto = require("crypto");

// Generate a unique test admin user and team for each test run
const randomSuffix = crypto.randomBytes(3).toString("hex");
const adminUser = {
    name: `AdminUser_${randomSuffix}`,
    email: `admin_${randomSuffix}@example.com`,
    password: `AdminPass_${randomSuffix}`,
    user_type: "admin"
};

let teamId, assignedUser;
let adminSession = request.agent(app); // Maintain session across tests

process.env.NODE_ENV = "test";

// Ensure database schema is loaded before running tests
beforeAll(async () => {
    console.log("Setting up test database...");
    await request(app).post("/register").send(adminUser);
    
    // Login as the admin to maintain session
    const loginRes = await adminSession.post("/login").send({
        email: adminUser.email,
        password: adminUser.password
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("redirect");
    console.log("Admin login successful.");
});

// Close the database connection after all tests
afterAll((done) => {
    connection.end(() => {
        console.log("Database connection closed.");
        done();
    });
});

describe("Team Management API Tests", () => {

    /** Test 1: Create a New Team Successfully */
    test("Create a new team", async () => {
        const res = await adminSession.post("/create-team").send({ teamName: `Team_${randomSuffix}` });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toBe("Team created successfully!");

        // Store team ID for further tests
        const teamRes = await adminSession.get(`/get-team-id?teamName=Team_${randomSuffix}`);
        expect(teamRes.status).toBe(200);
        teamId = teamRes.body.teamId;
    });

    /** Test 2: Prevent Duplicate Team Creation */
    test("Creating a team with an existing name should return 400", async () => {
        const res = await adminSession.post("/create-team").send({ teamName: `Team_${randomSuffix}` });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    /** Test 3: Assign a User to a Team */
    test("Assign an existing user to a team", async () => {
        // Fetch a random user from the database
        const usersRes = await request(app).get("/api/users");
        expect(usersRes.status).toBe(200);
        expect(usersRes.body.all_users.length).toBeGreaterThan(0);

        assignedUser = usersRes.body.all_users[0].name;

        const assignRes = await adminSession.post("/assign-user-to-team").send({
            teamId,
            userName: assignedUser
        });

        expect(assignRes.status).toBe(200);
        expect(assignRes.body).toHaveProperty("message");
        expect(assignRes.body.message).toBe("User successfully assigned to the team.");
    });

    /** Test 4: Prevent Duplicate User Assignment */
    test("Assigning the same user to the same team should return 400", async () => {
        const res = await adminSession.post("/assign-user-to-team").send({
            teamId,
            userName: assignedUser
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });
});
