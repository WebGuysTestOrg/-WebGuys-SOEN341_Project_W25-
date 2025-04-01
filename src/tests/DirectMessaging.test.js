const request = require("supertest");
const { connection } = require("../server");
const { app, createTestUser, loginTestUser } = require("./authentication.test");
const crypto = require("crypto");
const http = require("http");
const socketIO = require("socket.io");
const { io } = require("socket.io-client");

process.env.NODE_ENV = "test";

// Generate random identifiers to avoid test conflicts
const random = crypto.randomBytes(3).toString("hex");

// Create test users
const admin = {
    username: `Admin_${random}`,
    email: `admin_${random}@example.com`,
    password: `Password123!`,
    user_type: "admin"
};

const user = {
    username: `User_${random}`,
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
const TEST_PORT = 4002;

// Setup before all tests
beforeAll((done) => {
    // First ensure database is set up
    connection.query("USE chathaven", (err) => {
        if (err) {
            console.error("Error connecting to database:", err);
            done(err);
            return;
        }

        try {
            // Create test users
            Promise.all([
                createTestUser(admin),
                createTestUser(user)
            ]).then(() => {
                // Start HTTP server for Socket.IO
        server = http.createServer(app);
                
                // Setup Socket.IO server
        ioServer = socketIO(server);

        ioServer.on("connection", (socket) => {
                    // Global messages
            socket.on("message", (msg) => {
                ioServer.emit("message", msg);
            });

                    // Direct messages
            socket.on("private-message", (msg) => {
                ioServer.emit("private-message", msg);
            });

                    // Channel messages
            socket.on("ChannelMessages", (msg) => {
                ioServer.emit("ChannelMessages", msg);
            });
        });

                // Start the server
                server.listen(TEST_PORT, () => {
            console.log("Test socket server running on port", TEST_PORT);
                
                    // Login admin and user to get IDs
                    adminSession = request.agent(app);
                    adminSession.post("/login").send({
                        email: admin.email,
                        password: admin.password
                    }).then((adminLoginRes) => {
                        adminId = adminLoginRes.body.user.id;
                        
                        userSession = request.agent(app);
                        return userSession.post("/login").send({
                            email: user.email,
                            password: user.password
                        });
                    }).then((userLoginRes) => {
                        userId = userLoginRes.body.user.id;
                        
                        // Create a team for channel message testing
                        return adminSession.post("/create-team").send({
                            teamName: `team_${random}`
                        });
                    }).then(() => {
                        return adminSession.get(`/get-team-id?teamName=team_${random}`);
                    }).then((getTeamIdRes) => {
                        teamId = getTeamIdRes.body.teamId;
                        
                        // Assign the user to the team
                        return adminSession.post("/assign-user-to-team").send({
                            teamId,
                            userName: user.name
                        });
                    }).then(() => {
                        // Create a channel for testing
                        return adminSession.post("/create-channel").send({
                            channelName,
                            teamId
                        });
                    }).then(() => {
            done();
                    }).catch((err) => {
                        console.error("Setup error:", err);
                        done(err);
                    });
        });
            }).catch(err => {
                console.error("Setup error:", err);
            done(err);
        });
    } catch (err) {
            console.error("Setup error:", err);
        done(err);
    }
});
}, 30000);

// Cleanup after all tests
afterAll((done) => {
    try {
        console.log("Cleaning up resources...");
        
        // Disconnect any active socket connections
    if (ioUser?.connected) ioUser.disconnect();
    if (ioAdmin?.connected) ioAdmin.disconnect();
  
        // Clean up database - delete messages
        connection.query(
            "DELETE FROM direct_messages WHERE sender_id IN (?, ?) OR recipient_id IN (?, ?)",
            [adminId, userId, adminId, userId],
            (err) => {
                if (err) console.error("Error cleaning direct messages:", err);
                
                // Clean up database - delete channel messages
                connection.query(
                    "DELETE FROM channels_messages WHERE team_name = ? AND channel_name = ?",
                    [`team_${random}`, channelName],
                    (err) => {
                        if (err) console.error("Error cleaning channel messages:", err);
                        
                        // Clean up database - delete user_channels
                        connection.query(
                            "DELETE FROM user_channels WHERE user_id IN (?, ?)",
                            [adminId, userId],
                            (err) => {
                                if (err) console.error("Error cleaning user_channels:", err);
                                
                                // Clean up database - delete channels
                                connection.query(
                                    "DELETE FROM channels WHERE name = ?",
                                    [channelName],
                                    (err) => {
                                        if (err) console.error("Error cleaning channels:", err);
                                        
                                        // Clean up database - delete user_teams
                                        connection.query(
                                            "DELETE FROM user_teams WHERE user_id IN (?, ?)",
                                            [adminId, userId],
                                            (err) => {
                                                if (err) console.error("Error cleaning user_teams:", err);
                                                
                                                // Clean up database - delete teams
                                                connection.query(
                                                    "DELETE FROM teams WHERE name = ?",
                                                    [`team_${random}`],
                                                    (err) => {
                                                        if (err) console.error("Error cleaning teams:", err);
                                                        
                                                        // Clean up database - delete users
                                                        connection.query(
                                                            "DELETE FROM user_form WHERE email IN (?, ?)",
                                                            [admin.email, user.email],
                                                            (err) => {
                                                                if (err) console.error("Error cleaning users:", err);
                                                                
                                                                // Close the server
                                                                server.close(() => {
                                                                    console.log("Test socket server closed");
                                                                    done();
                                                                });
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
                    }
                );
            }
        );
    } catch (error) {
        console.error("Error during cleanup:", error);
        done(error);
    }
}, 30000);

describe("Chat & Messaging Tests", () => {
    test("Users can send and receive global messages", (done) => {
        const testMessage = "Hello world!";
        let messageReceived = false;

        // Create a timeout to fail the test if message isn't received
        const timeout = setTimeout(() => {
            done(new Error("Global message not received within timeout"));
        }, 5000);
        
        // Connect user socket
        ioUser = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
        });

        ioUser.on("connect", () => {
            // Set up message listener
            ioUser.on("message", (msg) => {
                try {
                    expect(msg.text).toBe(testMessage);
                    messageReceived = true;
                    clearTimeout(timeout);
                    done();
                } catch (err) {
                    clearTimeout(timeout);
                    done(err);
                }
            });

            // Connect admin socket and send message
            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
                transports: ["websocket"],
                forceNew: true,
            });

            ioAdmin.on("connect", () => {
                ioAdmin.emit("message", { text: testMessage });
            });
            
            ioAdmin.on("connect_error", (err) => {
                clearTimeout(timeout);
                done(err);
            });
        });
        
        ioUser.on("connect_error", (err) => {
            clearTimeout(timeout);
            done(err);
        });
        }, 15000);

    test("Users can send and receive direct messages", (done) => {
        const payload = {
          senderId: adminId,
          recipientId: userId,
            text: "DM test message"
        };
      
        // Create a timeout to fail the test if message isn't received
        const timeout = setTimeout(() => {
            done(new Error("Direct message not received within timeout"));
        }, 5000);
      
        // Disconnect previous connections if they exist
        if (ioUser?.connected) ioUser.disconnect();
        if (ioAdmin?.connected) ioAdmin.disconnect();
        
        // Connect user socket
        ioUser = io(`http://localhost:${TEST_PORT}`, {
          transports: ["websocket"],
          forceNew: true,
        });
      
        ioUser.on("connect", () => {
            // Listen for direct messages
          ioUser.on("private-message", (msg) => {
            try {
              expect(msg.text).toBe(payload.text);
              expect(msg.senderId).toBe(payload.senderId);
              expect(msg.recipientId).toBe(payload.recipientId);
      
              clearTimeout(timeout);
              done();
            } catch (err) {
              clearTimeout(timeout);
              done(err);
            }
          });
      
            // Connect admin socket and send message
            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
          });
      
          ioAdmin.on("connect", () => {
            setTimeout(() => {
              ioAdmin.emit("private-message", payload);
                }, 500);
            });
            
            ioAdmin.on("connect_error", (err) => {
                clearTimeout(timeout);
                done(err);
            });
        });
        
        ioUser.on("connect_error", (err) => {
            clearTimeout(timeout);
            done(err);
        });
    }, 15000);
    
    test("Messages can be stored and retrieved", async () => {
        // Ensure at least one message exists
        const messageText = `Test message ${random}`;
        
        // Insert a test message directly to database
        await new Promise((resolve, reject) => {
            connection.query(
                "INSERT INTO direct_messages (sender_id, recipient_id, text) VALUES (?, ?, ?)",
                [adminId, userId, messageText],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Retrieve messages with the API
        const res = await userSession.get(`/get-messages?senderId=${adminId}&recipientId=${userId}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        // Find our test message
        const testMessage = res.body.find(msg => msg.text === messageText);
        expect(testMessage).toBeDefined();
        expect(testMessage.senderId).toBe(adminId);
        expect(testMessage.recipientId).toBe(userId);
    }, 10000);
    
    test("Team channel messages can be sent and received", (done) => {
        const payload = {
          senderId: adminId,
            channelName: channelName,
          teamId: teamId,
            text: "Channel test message",
            teamName: `team_${random}`,
            sender: admin.name
        };
      
        // Create a timeout to fail the test if message isn't received
        const timeout = setTimeout(() => {
            done(new Error("Channel message not received within timeout"));
        }, 5000);
      
        // Disconnect previous connections if they exist
        if (ioUser?.connected) ioUser.disconnect();
        if (ioAdmin?.connected) ioAdmin.disconnect();
        
        // Connect user socket
        ioUser = io(`http://localhost:${TEST_PORT}`, {
          transports: ["websocket"],
          forceNew: true,
        });
      
        ioUser.on("connect", () => {
            // Listen for channel messages
          ioUser.on("ChannelMessages", (msg) => {
            try {
              expect(msg.text).toBe(payload.text);
              expect(msg.channelName).toBe(payload.channelName);
                    expect(msg.teamName).toBe(payload.teamName);
      
              clearTimeout(timeout);
              done();
            } catch (err) {
              clearTimeout(timeout);
              done(err);
            }
          });
      
            // Connect admin socket and send message
            ioAdmin = io(`http://localhost:${TEST_PORT}`, {
            transports: ["websocket"],
            forceNew: true,
          });
      
          ioAdmin.on("connect", () => {
            setTimeout(() => {
              ioAdmin.emit("ChannelMessages", payload);
                }, 500);
            });
            
            ioAdmin.on("connect_error", (err) => {
                clearTimeout(timeout);
                done(err);
            });
        });
        
        ioUser.on("connect_error", (err) => {
            clearTimeout(timeout);
            done(err);
        });
    }, 15000);
    
    test("Channel messages can be stored and retrieved", async () => {
        // Send a channel message via the API
        const messageText = `Channel message ${random}`;
        await adminSession.post("/sendChannelMessage").send({
            teamName: `team_${random}`,
            channelName: channelName,
            sender: admin.name,
            text: messageText
        });
        
        // Wait a bit for DB operation to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Retrieve channel messages
        const res = await adminSession.post("/get-channel-messages").send({
            teamName: `team_${random}`,
            channelName: channelName
        });
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        // Find our test message
        const testMessage = res.body.find(msg => msg.text === messageText);
        expect(testMessage).toBeDefined();
        expect(testMessage.sender).toBe(admin.name);
    }, 10000);
});
