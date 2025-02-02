const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const session = require("express-session");
const path = require("path");
const sharedSession = require("express-socket.io-session"); 
const {Server} =require("socket.io") 



const app = express();

const PORT= process.env.PORT|| 3000
const expressServer=app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const sessionMiddleware= 
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 3600000 },
    });

app.use(sessionMiddleware)
app.use(express.static(path.join(__dirname, "public")));

const io= new Server(expressServer,{
    cors:{
        origin:process.env.NODE_ENV==="production"? false :["http://localhost:3000","http://127.0.0.1:3000"]
    }
})
io.use(sharedSession(sessionMiddleware, {
    autoSave: true,  // Automatically save session on socket events
}));
io.on('connection',socket =>{
    const session = socket.handshake.session;

    if (session && session.user && session.user.name) {
        console.log(`User ${session.user.name} connected`);
    } else {
        console.log(`User with no session connected`);
    }
    socket.on('message',data=>{
        const message = data.text;
         
        const user = session.user && session.user.name ? `${session.user.name}[${session.user.user_type}_${session.user.id.toString().padStart(3, '0')}]`:"Anonymous"; 
        io.emit('message',{SSocketId:socket.id,user:user,text:message})
    })

    socket.on("disconnect", (reason) => {
        console.log(`User ${socket.id} disconnected: ${reason}`);
    });
})


// Database Connection
const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "chathaven",
});

connection.connect((err) => {
    if (err) throw err;
    console.log("Connected to the database.");
});






// User Registration
app.post("/register", (req, res) => {
    const { name, email, password, cpassword, user_type } = req.body;

    if (password !== cpassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

    const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
    connection.query(checkEmailQuery, [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (results.length > 0) {
            return res.status(400).json({ error: "Email is already in use!" });
        }

        const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
        const insertQuery = "INSERT INTO user_form (name, email, password, user_type) VALUES (?, ?, ?, ?)";

        connection.query(insertQuery, [name, email, hashedPassword, user_type], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Error registering user." });
            }
            res.status(200).json({ redirect: "/login_form.html" });
        });
    });
});


// User Login
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = crypto.createHash("md5").update(password).digest("hex");
    const query = "SELECT * FROM user_form WHERE email = ? AND password = ?";

    connection.query(query, [email, hashedPassword], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (results.length > 0) {
            const user = results[0];
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
            };

            if (user.user_type === "admin") {
                return res.json({ redirect: "/admin_page.html" });
            } else {
                return res.json({ redirect: "/user_page.html" });
            }
        } else {
            res.status(401).json({ error: "Invalid email or password." });
        }
    });
});

// Fetch User Info
app.get("/user-info", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name });
});

app.get("/admin-info", (req, res) => {
    if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name });
});


app.post("/create-team", (req, res) => {
    const { teamName } = req.body;

    
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    const createdBy = req.session.user.id;

    if (!teamName || !createdBy) {
        return res.status(400).json({ error: "Team name and creator are required." });
    }

    const query = "INSERT INTO teams (name, created_by) VALUES (?, ?)";
    connection.query(query, [teamName, createdBy], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error creating team." });
        }
        res.json({ message: "Team created successfully." });
    });
});


app.get("/get-team-id", (req, res) => {
    const { teamName } = req.query;
    if (!teamName) return res.status(400).json({ error: "Team name is required." });

    const query = "SELECT id FROM teams WHERE name = ?";
    connection.query(query, [teamName], (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching team ID." });
        if (results.length === 0) return res.status(404).json({ error: "Team not found." });
        res.json({ teamId: results[0].id });
    });
});

app.post("/create-channel", (req, res) => {
    const { channelName, teamId } = req.body;
    if (!channelName || !teamId) return res.status(400).json({ error: "Channel name and team ID are required." });

    const query = "INSERT INTO channels (name, team_id) VALUES (?, ?)";
    connection.query(query, [channelName, teamId], (err) => {
        if (err) return res.status(500).json({ error: "Error creating channel." });
        res.json({ message: "Channel created successfully." });
    });
});

// Assign User to Channel
app.post("/assign-user", (req, res) => {
    const { teamId, channelName, userName } = req.body;

    if (!teamId || !channelName || !userName) {
        return res.status(400).json({ error: "Team ID, Channel Name, and User Name are required." });
    }

    const channelQuery = "SELECT id FROM channels WHERE name = ? AND team_id = ?";
    const userQuery = "SELECT id FROM user_form WHERE name = ?";
    const assignQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";

    connection.query(channelQuery, [channelName, teamId], (err, channelResults) => {
        if (err || channelResults.length === 0) {
            return res.status(404).json({ error: "Channel not found in the specified team." });
        }

        const channelId = channelResults[0].id;

        connection.query(userQuery, [userName], (err, userResults) => {
            if (err || userResults.length === 0) {
                return res.status(404).json({ error: "User not found." });
            }

            const userId = userResults[0].id;

            connection.query(assignQuery, [userId, channelId], (err) => {
                if (err) {
                    return res.status(500).json({ error: "Error assigning user to channel." });
                }
                res.json({ message: "User assigned to channel successfully." });
            });
        });
    });
});


app.get("/get-teams-with-channels", (req, res) => {
    const query = `
        SELECT 
            t.name AS team_name, 
            c.name AS channel_name,
            u.name AS user_name
        FROM 
            teams t
        LEFT JOIN 
            channels c ON t.id = c.team_id
        LEFT JOIN 
            user_channels cu ON c.id = cu.channel_id
        LEFT JOIN 
            user_form u ON cu.user_id = u.id
        ORDER BY 
            t.name, c.name, u.name;
    `;
    connection.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching data." });

        const teams = {};
        results.forEach(row => {
            if (!teams[row.team_name]) {
                teams[row.team_name] = { teamName: row.team_name, channels: {} };
            }
            if (row.channel_name) {
                if (!teams[row.team_name].channels[row.channel_name]) {
                    teams[row.team_name].channels[row.channel_name] = { channelName: row.channel_name, members: [] };
                }
                if (row.user_name) {
                    teams[row.team_name].channels[row.channel_name].members.push(row.user_name);
                }
            }
        });
        res.json(teams);
    });
});

app.get("/get-user-teams", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.session.user.id;

    const query = `
        SELECT 
            t.id AS team_id, 
            t.name AS team_name, 
            c.id AS channel_id,
            c.name AS channel_name,
            u.name AS user_name
        FROM 
            teams t
        INNER JOIN 
            channels c ON t.id = c.team_id
        INNER JOIN 
            user_channels cu ON c.id = cu.channel_id
        INNER JOIN 
            user_form u ON cu.user_id = u.id
        WHERE 
            c.id IN (
                SELECT DISTINCT cu.channel_id
                FROM user_channels cu
                WHERE cu.user_id = ?
            )
        ORDER BY 
            t.id, c.id, u.name;
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching user teams." });
        }

        const userTeams = {};
        results.forEach((row) => {
            if (!userTeams[row.team_id]) {
                userTeams[row.team_id] = {
                    teamName: row.team_name,
                    channels: {},
                };
            }
            if (row.channel_id) {
                if (!userTeams[row.team_id].channels[row.channel_id]) {
                    userTeams[row.team_id].channels[row.channel_id] = {
                        channelName: row.channel_name,
                        members: [],
                    };
                }
                if (row.user_name) {
                    userTeams[row.team_id].channels[row.channel_id].members.push(row.user_name);
                }
            }
        });

        res.json(userTeams);
    });
});

// Logout Route
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ error: "Error logging out." });
        }
        res.redirect("/login_form.html"); 
    });
});


