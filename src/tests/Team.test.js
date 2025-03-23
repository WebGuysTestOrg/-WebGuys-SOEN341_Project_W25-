const request = require("supertest");
const { app, connection } = require("../server");
const crypto = require("crypto");
process.env.NODE_ENV = "test";


const randomSuffix = crypto.randomBytes(3).toString("hex");
const adminUser = {
    name: `AdminUser_${randomSuffix}`,
    email: `admin_${randomSuffix}@example.com`,
    password: `AdminPass_${randomSuffix}`,
    user_type: "admin"
};

let teamId;
let assignedUser;

afterAll((done) => {
    connection.end(() => {
        console.log("Database connection closed.");
        done();
    });
});

describe("Team Management API Tests (Independent Flow)", () => {

    test("Register, login as admin, create team, and assign user", async () => {
        const agent = request.agent(app); // persist session

        // 1. Register
        const registerRes = await agent.post("/register").send({
            ...adminUser,
            cpassword: adminUser.password
        });
        expect(registerRes.status).toBe(200);

        // 2. Login
        const loginRes = await agent.post("/login").send({
            email: adminUser.email,
            password: adminUser.password
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body).toHaveProperty("redirect");

        // 3. Create Team
        const teamName = `Team_${randomSuffix}`;
        const createTeamRes = await agent.post("/create-team").send({ teamName });
        expect(createTeamRes.status).toBe(200);
        expect(createTeamRes.body.message).toBe("Team created successfully!");

        // 4. Get team ID
        const teamIdRes = await agent.get(`/get-team-id?teamName=${teamName}`);
        expect(teamIdRes.status).toBe(200);
        teamId = teamIdRes.body.teamId;

        // 5. Pick a user to assign
        const usersRes = await agent.get("/api/users");
        expect(usersRes.status).toBe(200);
        expect(usersRes.body.all_users.length).toBeGreaterThan(0);
        assignedUser = usersRes.body.all_users[0].name;

        // 6. Assign user to team
        const assignRes = await agent.post("/assign-user-to-team").send({
            teamId,
            userName: assignedUser
        });
        expect(assignRes.status).toBe(200);
        expect(assignRes.body.message).toBe("User successfully assigned to the team.");

        // 7. Try assigning same user again (should fail)
        const duplicateAssignRes = await agent.post("/assign-user-to-team").send({
            teamId,
            userName: assignedUser
        });
        expect(duplicateAssignRes.status).toBe(400);
        expect(duplicateAssignRes.body).toHaveProperty("error");
    });
});

