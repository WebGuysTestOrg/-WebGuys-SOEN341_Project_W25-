const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const session = require("express-session");
const path = require("path");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 3600000 },
    })
);

app.use(express.static(path.join(__dirname, "public")));


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


app.post("/register", (req, res) => {
    const { name, email, password, cpassword, user_type } = req.body;

    if (password !== cpassword) {
        return res.status(400).json({ error: "Passwords do not match!" });
    }

   
    const checkEmailQuery = "SELECT id FROM user_form WHERE email = ?";
    connection.query(checkEmailQuery, [email], (err, emailResults) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Server error. Please try again later." });
        }

        if (emailResults.length > 0) {
            return res.status(400).json({ error: "Email is already in use!" });
        }

        
        const checkUsernameQuery = "SELECT id FROM user_form WHERE name = ?";
        connection.query(checkUsernameQuery, [name], (err, nameResults) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Server error. Please try again later." });
            }

            if (nameResults.length > 0) {
                return res.status(400).json({ error: "Username is already in use!" });
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
});




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


app.get("/user-info", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name, id: req.session.user.id});
});

app.get("/admin-info", (req, res) => {
    if (!req.session.user || req.session.user.user_type !== "admin") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ name: req.session.user.name });
});

app.post("/create-team", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    const { teamName } = req.body;
    const createdBy = req.session.user.id; // Get user ID from session

    if (!teamName) {
        return res.status(400).json({ error: "Team name is required." });
    }

    
    const insertTeamQuery = "INSERT INTO teams (name, created_by) VALUES (?, ?)";
    connection.query(insertTeamQuery, [teamName, createdBy], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error creating team." });
        }

        const teamId = result.insertId; 

        
        const insertCreatorQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";
        connection.query(insertCreatorQuery, [createdBy, teamId], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Error adding creator to team." });
            }
            res.json({ message: "Team created successfully!", teamId });
        });
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
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.session.user.id;
    const userRole = req.session.user.user_type; 

    
    const checkTeamCreatorQuery = "SELECT created_by FROM teams WHERE id = ?";
    connection.query(checkTeamCreatorQuery, [teamId], (err, results) => {
        if (err) return res.status(500).json({ error: "Server error" });
        if (results.length === 0) return res.status(404).json({ error: "Team not found" });

        const teamCreatorId = results[0].created_by;

        if (userId === teamCreatorId || userRole === "admin") {
            
            const createChannelQuery = "INSERT INTO channels (name, team_id) VALUES (?, ?)";
            connection.query(createChannelQuery, [channelName, teamId], (err, result) => {
                if (err) return res.status(500).json({ error: "Error creating channel" });

                const channelId = result.insertId;

               
                const assignCreatorQuery = "INSERT INTO user_channels (user_id, channel_id) VALUES (?, ?)";
                connection.query(assignCreatorQuery, [teamCreatorId, channelId], (err) => {
                    if (err) return res.status(500).json({ error: "Error adding creator to channel" });

                    res.json({ message: "Channel created successfully" });
                });
            });
        } else {
            res.status(403).json({ error: "You are not authorized to create channels for this team." });
        }
    });
});


app.post("/assign-user", (req, res) => {
    const { teamId, channelName, userName } = req.body;
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.session.user.id;
    const userRole = req.session.user.user_type; 

    
    const checkTeamCreatorQuery = "SELECT created_by FROM teams WHERE id = ?";
    connection.query(checkTeamCreatorQuery, [teamId], (err, results) => {
        if (err) return res.status(500).json({ error: "Server error" });
        if (results.length === 0) return res.status(404).json({ error: "Team not found" });

        const teamCreatorId = results[0].created_by;

        if (userId === teamCreatorId || userRole === "admin") {
           
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

                    const userToAddId = userResults[0].id;

                    connection.query(assignQuery, [userToAddId, channelId], (err) => {
                        if (err) {
                            return res.status(500).json({ error: "Error assigning user to channel." });
                        }
                        res.json({ message: "User assigned to channel successfully!" });
                    });
                });
            });
        } else {
            res.status(403).json({ error: "You are not authorized to add users to this channel." });
        }
    });
});



app.get("/get-teams-with-channels", (req, res) => {
    const query = `
        SELECT 
            t.id AS team_id, 
            t.name AS team_name, 
            t.created_by AS creator_id,
            u.name AS creator_name,  
            c.id AS channel_id,
            c.name AS channel_name,
            m.name AS user_name
        FROM 
            teams t
        LEFT JOIN 
            user_form u ON t.created_by = u.id  
        LEFT JOIN 
            channels c ON t.id = c.team_id
        LEFT JOIN 
            user_channels cu ON c.id = cu.channel_id
        LEFT JOIN 
            user_form m ON cu.user_id = m.id
        ORDER BY 
            t.id, c.id, m.name;
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching teams." });
        }

        const teams = {};
        results.forEach((row) => {
            if (!teams[row.team_id]) {
                teams[row.team_id] = {
                    teamId: row.team_id,
                    teamName: row.team_name,
                    createdBy: row.creator_id,  
                    creatorName: row.creator_name,  
                    channels: {},
                    members: new Set(), 
                };
            }
            if (row.channel_id) {
                if (!teams[row.team_id].channels[row.channel_id]) {
                    teams[row.team_id].channels[row.channel_id] = {
                        channelName: row.channel_name,
                        members: [],
                    };
                }
                if (row.user_name) {
                    teams[row.team_id].channels[row.channel_id].members.push(row.user_name);
                }
            }
           
            teams[row.team_id].members.add(row.creator_name);
        });

       
        Object.values(teams).forEach(team => {
            team.members = Array.from(team.members);
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
            t.created_by AS creator_id,
            u.name AS creator_name,  
            c.id AS channel_id,
            c.name AS channel_name,
            m.name AS user_name
        FROM 
            teams t
        LEFT JOIN 
            user_form u ON t.created_by = u.id  
        LEFT JOIN 
            channels c ON t.id = c.team_id
        LEFT JOIN 
            user_channels cu ON c.id = cu.channel_id
        LEFT JOIN 
            user_form m ON cu.user_id = m.id
        WHERE 
            t.created_by = ? OR 
            t.id IN (SELECT DISTINCT team_id FROM channels WHERE id IN (SELECT channel_id FROM user_channels WHERE user_id = ?))
        ORDER BY 
            t.id, c.id, m.name;
    `;

    connection.query(query, [userId, userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error fetching user teams." });
        }

        const userTeams = {};
        results.forEach((row) => {
            if (!userTeams[row.team_id]) {
                userTeams[row.team_id] = {
                    teamId: row.team_id,
                    teamName: row.team_name,
                    createdBy: row.creator_id,  
                    creatorName: row.creator_name,  
                    channels: {},
                    members: new Set(), 
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
            
            userTeams[row.team_id].members.add(row.creator_name);
        });

        
        Object.values(userTeams).forEach(team => {
            team.members = Array.from(team.members);
        });

        res.json(userTeams);
    });
});





app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ error: "Error logging out." });
        }
        res.redirect("/login_form.html"); 
    });
});


app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});