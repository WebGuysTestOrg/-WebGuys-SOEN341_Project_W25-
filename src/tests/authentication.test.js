const request = require("supertest");
const { app, connection } = require("../server"); // Adjust path if needed
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

// Start the test server before running tests
beforeAll(() => {
    server = app.listen(4000, () => console.log("Test server running..."));
});

// Close the test server and database connection after all tests
afterAll((done) => {
    server.close(() => {
        console.log("Test server closed.");
        connection.end(() => {
            console.log("Database connection closed.");
            done();
        });
    });
});

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
        const res = await request(app).post("/login").send({
            email: testUser.email,
            password: testUser.password
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("redirect");
        expect(typeof res.body.redirect).toBe("string");
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
});

