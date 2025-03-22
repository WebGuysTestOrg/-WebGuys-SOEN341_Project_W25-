const request = require("supertest");
const { app, connection } = require("../server");
const crypto = require("crypto");
const { io } = require("socket.io-client");
const http = require("http");
const socketIO = require("socket.io");

process.env.NODE_ENV = "test";

const random = crypto.randomBytes(3).toString("hex");

const admin = {
    name: `Admin_${random}`,
    email: `admin_${random}@example.com`,
    password: `Password123!`,
    user_type: "admin"
};

const user = {
    name: `User_${random}`,
    email: `user_${random}@example.com`,
    password: `Password123!`,
    user_type: "user"
};

let adminSession;
let userSession;
let adminId;
let userId;
let teamId;
let channelName = `channel_${random}`;
let ioAdmin, ioUser;

let server, ioServer;
let TEST_PORT;

beforeAll((done) => {
    try {
        server = http.createServer(app);
        ioServer = socketIO(server);

        ioServer.on("connection", (socket) => {
            socket.on("message", (msg) => {
                ioServer.emit("message", msg);
            });

            socket.on("private-message", (msg) => {
                ioServer.emit("private-message", msg);
            });

            socket.on("ChannelMessages", (msg) => {
                ioServer.emit("ChannelMessages", msg);
            });
        });

        server.listen(0, () => {
            TEST_PORT = server.address().port;
            console.log("Test socket server running on port", TEST_PORT);
            done();
        });

        server.on("error", (err) => {
            console.error("Server listen error:", err);
            done(err);
        });
    } catch (err) {
        console.error("Exception in beforeAll:", err);
        done(err);
    }
});

afterAll((done) => {
    server.close(() => {
        connection.end(() => {
            console.log("Server and DB closed");
            done();
        });
    });
});

describe("Team Chat + Messaging Integration Flow", () => {
    test("Register admin and user", async () => {
        await request(app).post("/register").send({ ...admin, cpassword: admin.password });
        await request(app).post("/register").send({ ...user, cpassword: user.password });
    });

    test("Login admin and user", async () => {
        adminSession = request.agent(app);
        const res1 = await adminSession.post("/login").send({ email: admin.email, password: admin.password });
        expect(res1.status).toBe(200);
        adminId = res1.body.user.id;
        console.log("res1.body =", res1.body);

        userSession = request.agent(app);
        const res2 = await userSession.post("/login").send({ email: user.email, password: user.password });
        expect(res2.status).toBe(200);
        userId = res2.body.user.id;
    });

    test("Admin creates team and adds user", async () => {
        const createTeam = await adminSession.post("/create-team").send({ teamName: `team_${random}` });
        expect(createTeam.status).toBe(200);

        const getId = await adminSession.get(`/get-team-id?teamName=team_${random}`);
        expect(getId.status).toBe(200);
        teamId = getId.body.teamId;

        const assignUser = await adminSession.post("/assign-user-to-team").send({
            teamId,
            userName: user.name
        });
        expect(assignUser.status).toBe(200);
    });

    test("Admin creates channel and assigns user", async () => {
        const res = await adminSession.post("/create-channel").send({
            channelName,
            teamId
        });
        expect(res.status).toBe(200);
    });

    test("Users connect to socket and see global message", (done) => {
        let messageReceived = false;

        ioUser = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
        });

        ioUser.on("connect", () => {
            ioUser.on("message", (msg) => {
                try {
                    expect(msg.text).toBe("Hello world!");
                    messageReceived = true;
                    done();
                } catch (err) {
                    done(err);
                }
            });

            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
                transports: ["websocket"],
                forceNew: true,
            });

            ioAdmin.on("connect", () => {
                ioAdmin.emit("message", { text: "Hello world!" });
            });

            ioAdmin.on("connect_error", done);
        });

        ioUser.on("connect_error", done);

        setTimeout(() => {
            if (!messageReceived) done("Global message not received.");
        }, 4000);
    });

    test("Direct message is received", (done) => {
        const payload = {
            senderId: adminId,
            recipientId: userId,
            text: "DM test"
        };

        ioUser = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
        });

        ioUser.on("connect", () => {
            console.log("User connected");
            ioUser.on("private-message", (msg) => {
                try {
                    expect(msg.text).toBe(payload.text);
                    expect(msg.senderId).toBe(payload.senderId);
                    expect(msg.recipientId).toBe(payload.recipientId);
                    done();
                } catch (err) {
                    done(err);
                }
            });

            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
                transports: ["websocket"],
                forceNew: true,
            });

            ioAdmin.on("connect", () => {
                console.log("Admin connected");
                ioAdmin.emit("private-message", payload);
            });

            ioAdmin.on("connect_error", done);
        });

        ioUser.on("connect_error", done);

        setTimeout(() => {
            done("DM not received within timeout");
        }, 5000);
    });

    test("Team channel message is received", (done) => {
        if (!adminId || !userId) return done("Missing adminId or userId");
    
        const payload = {
            teamName: `team_${random}`,
            channelName: channelName,
            sender: admin.name,
            text: "Team channel test"
        };
    
        ioUser = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
        });
    
        ioUser.on("connect", () => {
            console.log("User connected for ChannelMessage");
    
            ioUser.on("ChannelMessages", (msg) => {
                try {
                    expect(msg.text).toBe(payload.text);
                    done();
                } catch (err) {
                    done(err);
                }
            });
    
            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
                transports: ["websocket"],
                forceNew: true,
            });
    
            ioAdmin.on("connect", () => {
                console.log("Admin connected for ChannelMessage");
                ioAdmin.emit("ChannelMessages", payload);
            });
    
            ioAdmin.on("connect_error", done);
        });
    
        ioUser.on("connect_error", done);
    
        setTimeout(() => {
            done("Channel message not received within timeout");
        }, 4000);
    });
    
});
