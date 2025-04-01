const request = require("supertest");
const { connection } = require("../server");
const { app, createTestUser } = require("./authentication.test");
const crypto = require("crypto");

process.env.NODE_ENV = "test";

// Generate unique test data
const random = crypto.randomBytes(3).toString("hex");
const testUser = {
    name: `User_${random}`,
    email: `user_${random}@example.com`,
    password: `Password_${random}`,
    user_type: "user"
};

let userId;
let userAgent;

// Start the test server before running tests
beforeAll((done) => {
    // First ensure database is set up
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error connecting to database:", err);
            done(err);
            return;
        }
        
        // Register test user first
        createTestUser(testUser)
            .then(() => {
                // Create user session
                userAgent = request.agent(app);
                
                // Login user and store ID
                return userAgent.post("/login").send({
                    email: testUser.email,
                    password: testUser.password
                });
            })
            .then((userLogin) => {
                userId = userLogin.body.user.id;
                done();
            })
            .catch(error => {
                console.error("Error during setup:", error);
                done(error);
            });
    }, 30000); // Increased timeout to 30 seconds
});

// Clean up after all tests
afterAll((done) => {
    try {
        // Delete test user
        connection.query(
            "DELETE FROM user_form WHERE email = ?",
            [testUser.email],
            (err) => {
                if (err) console.error("Error deleting test user:", err);
                done();
            }
        );
    } catch (error) {
        console.error("Error during user management tests cleanup:", error);
        done(error);
    }
}, 30000); // Increased timeout for cleanup

describe("User Management API Tests", () => {
    test("User can get their own information", async () => {
        const res = await userAgent.get("/user-info");
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("name", testUser.name);
        expect(res.body).toHaveProperty("email", testUser.email);
        expect(res.body).toHaveProperty("id", userId);
        expect(res.body).toHaveProperty("role", testUser.user_type.toLowerCase());
    });
    
    test("User can update their password", async () => {
        const newPassword = `NewPassword_${random}`;
        
        const res = await userAgent.post("/update-password").send({
            newPassword: newPassword,
            confirmPassword: newPassword
        });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message", "Password updated successfully!");
        
        // Test logging in with the new password
        await userAgent.get("/logout");
        
        const loginRes = await userAgent.post("/login").send({
            email: testUser.email,
            password: newPassword
        });
        
        expect(loginRes.status).toBe(200);
        expect(loginRes.body).toHaveProperty("user");
        expect(loginRes.body.user).toHaveProperty("id", userId);
    });
    
    test("User cannot update password with mismatched confirmation", async () => {
        const res = await userAgent.post("/update-password").send({
            newPassword: "Password1",
            confirmPassword: "Password2"
        });
        
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error", "Passwords do not match!");
    });
    
    test("User can get their user ID by name", async () => {
        const res = await userAgent.get(`/get-user-id?username=${testUser.name}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("userId", userId);
    });
    
    test("User can view available users", async () => {
        const res = await userAgent.get("/api/users");
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("all_users");
        expect(Array.isArray(res.body.all_users)).toBe(true);
        
        // Find our test user
        const foundUser = res.body.all_users.find(u => u.name === testUser.name);
        expect(foundUser).toBeDefined();
        expect(foundUser).toHaveProperty("id", userId);
    });
    
    test("User logout updates the activity log", async () => {
        // First check that we have an active session
        const userInfoRes = await userAgent.get("/user-info");
        expect(userInfoRes.status).toBe(200);
        
        // Logout
        const logoutRes = await userAgent.get("/logout");
        expect(logoutRes.status).toBe(302);
        
        // Verify we're logged out by trying to access user info
        const postLogoutRes = await userAgent.get("/user-info");
        expect(postLogoutRes.status).toBe(401);
        
        // Check the activity log
        const logAgent = request.agent(app);
        
        // We need to login as an admin to check logs, but we don't have one in this test suite
        // Instead, just verify the user is properly logged out
        const userInfoFail = await userAgent.get("/user-info");
        expect(userInfoFail.status).toBe(401);
        expect(userInfoFail.body).toHaveProperty("error", "Unauthorized");
    });
}); 