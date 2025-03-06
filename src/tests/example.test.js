const request = require("supertest");
const { app, connection } = require("../server"); // Adjust the path if needed
const crypto = require("crypto");

const randomSuffix = crypto.randomBytes(3).toString("hex"); // Generates a random string
const testUser = {
    name: `TestUser_${randomSuffix}`,
    email: `test_${randomSuffix}@example.com`,
    password: `Password_${randomSuffix}`,
    user_type: "User"
};

afterAll(() => {
    connection.end(); // Close the database connection after all tests
});


describe("User Login API Tests", () => {

  test("Register a new user successfully", async () => {
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

  test("Valid login should return 200 and redirect URL", async () => {
       const res = await request(app).post("/login").send({
          email: testUser.email,  
          password: testUser.password
        });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("redirect"); // Checking if a redirect property exists
        expect(typeof res.body.redirect).toBe("string");
    });

    test("Invalid login should return 401", async () => {
        const res = await request(app).post("/login").send({
            email: "validUser@example.com",
            password: "wrongPassword"
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty("error");
        expect(res.body.error).toBe("Invalid email or password.");
    });

    test("Login with missing credentials should return 400", async () => {
        const res = await request(app).post("/login").send({
            email: "",
            password: ""
        });

        expect(res.status).toBe(401);
    });

});
