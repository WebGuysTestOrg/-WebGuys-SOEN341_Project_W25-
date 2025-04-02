const request = require("supertest");
const { app, connection } = require("../server"); // This may not be exporting correctly
const crypto = require("crypto");
process.env.NODE_ENV = "test";

// Server reference
let server;

// Generate a unique test user for each test run
const randomSuffix = crypto.randomBytes(3).toString("hex"); // Generates a random string
const testUser = {
    name: `TestUser_${randomSuffix}`,
    email: `test_${randomSuffix}@example.com`,
    password: `Password_${randomSuffix}`,
    user_type: "User"
};

// Helper function to create a user with specified role
async function createTestUser(userDetails) {
    // Use app directly since we may not have a server yet
    const res = await request(app).post("/register").send({
        name: userDetails.name,
        email: userDetails.email,
        password: userDetails.password,
        cpassword: userDetails.password,
        user_type: userDetails.user_type
    });
    return res;
}

// Helper function to login user
async function loginTestUser(email, password) {
    // Use app directly since we may not have a server yet
    const res = await request(app).post("/login").send({
        email: email,
        password: password
    });
    return res;
}

// Initialize database connection before all tests
beforeAll((done) => {
    // First ensure database is set up
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error connecting to database:", err);
            done(err);
            return;
        }

        // Then start the test server
        server = app.listen(4000, () => {
            console.log("Authentication test server running on port 4000");
            done();
        });
    });
}, 30000); // Increased timeout to 30 seconds

// Close the test server and database connection after all tests
afterAll((done) => {
    // Clean up test user
    try {
        connection.query("DELETE FROM user_form WHERE email = ?", [testUser.email], (err) => {
            if (err) {
                console.error("Error deleting test user:", err);
            } else {
                console.log("Test user deleted successfully");
            }
            
            // Close server and database connection
            server.close(() => {
                console.log("Authentication test server closed");
                done();
            });
        });
    } catch (error) {
        console.error("Error during clean up:", error);
        done(error);
    }
}, 30000); // Increased timeout for cleanup

// Only run the tests if this file is being run directly, not when imported
if (process.env.JEST_WORKER_ID && !process.env.IMPORTED_BY_OTHER_TEST) {
    describe("User Authentication API Tests", () => {
        /** Test 1: Register a New User Successfully */
        test("Register a new user", async () => {
            const res = await request(app).post("/register").send({
                name: testUser.name,
                email: testUser.email,
                password: testUser.password,
                cpassword: testUser.password, // Confirm password
                user_type: testUser.user_type
            });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("redirect");
            expect(typeof res.body.redirect).toBe("string");
        });

        /** Test 2: Valid Login */
        test("Valid login should return 200 and redirect URL", async () => {
            const res = await loginTestUser(testUser.email, testUser.password);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("redirect");
            expect(typeof res.body.redirect).toBe("string");
            expect(res.body).toHaveProperty("user");
            expect(res.body.user).toHaveProperty("id");
            expect(res.body.user).toHaveProperty("name", testUser.name);
        });

        /** Test 3: Invalid Login */
        test("Invalid login should return 401", async () => {
            const res = await request(app).post("/login").send({
                email: "validUser@example.com",
                password: "wrongPassword"
            });

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty("error");
            expect(res.body.error).toBe("Invalid email or password.");
        });

        /** Test 4: Login with Missing Credentials */
        test("Login with missing credentials should return 400", async () => {
            const res = await request(app).post("/login").send({
                email: "",
                password: ""
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
            expect(res.body.error).toBe("Email and password are required.");
        });

        /** Test 5: Register with an Invalid Email Format */
        test("Register with an invalid email format should return 400", async () => {
            const res = await request(app).post("/register").send({
                name: "InvalidEmailUser",
                email: "invalid-email",
                password: "SomePassword123",
                cpassword: "SomePassword123",
                user_type: "User"
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
        });

        /** Test 6: Register with Missing Password */
        test("Register with missing password should return 400", async () => {
            const res = await request(app).post("/register").send({
                name: "NoPasswordUser",
                email: "no-password@example.com",
                password: "",
                cpassword: "",
                user_type: "User"
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
        });

        /** Test 7: Register with Mismatched Passwords */
        test("Register with mismatched passwords should return 400", async () => {
            const res = await request(app).post("/register").send({
                name: "MismatchPasswordUser",
                email: "mismatch@example.com",
                password: "Password123",
                cpassword: "DifferentPassword",
                user_type: "User"
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
        });

        /** Test 8: Register with an Already Used Email */
        test("Register with an already used email should return 400", async () => {
            await request(app).post("/register").send({
                name: testUser.name,
                email: testUser.email,
                password: testUser.password,
                cpassword: testUser.password,
                user_type: testUser.user_type
            });

            const res = await request(app).post("/register").send({
                name: "DuplicateUser",
                email: testUser.email, // Same email as before
                password: "Password123",
                cpassword: "Password123",
                user_type: "User"
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
        });

        /** Test 9: Login with Unregistered Email */
        test("Login with unregistered email should return 401", async () => {
            const res = await request(app).post("/login").send({
                email: "nonexistent@example.com",
                password: "SomePassword123"
            });

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty("error");
        });
        
        /** Test 10: Get user information */
        test("Get user info should return user details after login", async () => {
            // Create a session
            const agent = request.agent(app);
            await agent.post("/login").send({
                email: testUser.email,
                password: testUser.password
            });
            
            const res = await agent.get("/user-info");
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("name", testUser.name);
            expect(res.body).toHaveProperty("email", testUser.email);
            expect(res.body).toHaveProperty("id");
            expect(res.body).toHaveProperty("role", testUser.user_type.toLowerCase());
        });
        
        /** Test 11: User logout */
        test("User logout should redirect to login page", async () => {
            // Create a session
            const agent = request.agent(app);
            await agent.post("/login").send({
                email: testUser.email,
                password: testUser.password
            });
            
            const res = await agent.get("/logout");
            
            expect(res.status).toBe(302); // Redirect status code
            expect(res.headers.location).toBe("/Login-Form.html");
        });
    });
}

// When this file is imported by another test file, set this flag
if (module.parent) {
    process.env.IMPORTED_BY_OTHER_TEST = "true";
}

// Export helper functions for other test files
module.exports = {
    createTestUser,
    loginTestUser,
    app // Export app for other test files to use
};

