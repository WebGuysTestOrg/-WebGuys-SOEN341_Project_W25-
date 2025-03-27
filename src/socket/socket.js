const { Server } = require("socket.io");
const sharedSession = require("express-socket.io-session");
const config = require("../config/config");
const connection = require("../database/connection");

const onlineUsers = new Map();
const awayUsers = new Map();

function initializeSocket(expressServer, sessionMiddleware) {
    const io = new Server(expressServer, {
        cors: {
            origin: config.CORS_ORIGINS
        }
    });

    io.use(sharedSession(sessionMiddleware, {
        autoSave: true
    }));

    io.on('connection', socket => {
        const session = socket.handshake.session;

        if (session && session.user && session.user.name) {
            console.log(`User ${session.user.name} connected`);
        } else {
            console.log(`User with no session connected`);
        }
        
        socket.on('message', data => {
            const message = data.text;
            const user = session.user && session.user.name 
                ? `${session.user.name}[${session.user.user_type}_${session.user.id.toString().padStart(3, '0')}]`
                : "Anonymous"; 
            io.emit('message', {
                SSocketId: socket.id,
                user: user,
                text: message,
                userID: session.user.id
            });
        });

        let inactivityTimer;

        socket.on("userOnline", (userId) => {
            onlineUsers.set(userId, socket.id);
            awayUsers.delete(userId);
            io.emit("updateUserStatus", {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
            resetInactivityTimer(userId);
        });

        socket.on("userAway", (userId) => {
            awayUsers.set(userId, socket.id);
            onlineUsers.delete(userId);
            io.emit("updateUserStatus", {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        socket.on("disconnect", () => {
            console.log(`User ${socket.id} disconnected`);
            onlineUsers.forEach((socketId, userId) => {
                if (socketId === socket.id) {
                    onlineUsers.delete(userId);
                    awayUsers.delete(userId);
                }
            });
            io.emit("updateUserStatus", {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        function startInactivityTimer(userId) {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                console.log(`User ${userId} is now away`);
                socket.emit("userAway", userId);
            }, config.INACTIVITY_TIME);
        }

        function resetInactivityTimer(userId) {
            clearTimeout(inactivityTimer);
            startInactivityTimer(userId);
            console.log(`User ${userId} is now online`);
        }
    });

    // Private messaging
    io.on("connection", (socket) => {
        socket.on("private-message", (msg) => {
            const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text, quoted_message) VALUES (?, ?, ?, ?)";
            const quotedText = msg.quoted ? msg.quoted.text : null;
            connection.query(insertQuery, [msg.senderId, msg.recipientId, msg.text, quotedText], (err) => {
                if (err) {
                    console.error("Error saving message:", err);
                    return;
                }
                const fullMessage = {
                    ...msg,
                    quoted: msg.quoted
                };
                io.emit("private-message", fullMessage);
            });
        });
    });

    // Channel messages
    io.on("connection", (socket) => {
        socket.on("ChannelMessages", (msg) => {
            const query = `
                INSERT INTO channels_messages (team_name, channel_name, sender, text, quoted_message) 
                VALUES (?, ?, ?, ?, ?)
            `;

            connection.query(query, [msg.teamName, msg.channelName, msg.sender, msg.text, msg.quoted], (err, result) => {
                if (err) {
                    console.error("Database error:", err);
                    return;
                }
                const messageWithId = {
                    id: result.insertId,
                    teamName: msg.teamName,
                    channelName: msg.channelName,
                    sender: msg.sender,
                    text: msg.text,
                    quoted: msg.quoted
                };
                io.emit("ChannelMessages", messageWithId);
            });
        });
    });

    // Group messages
    io.on("connection", (socket) => {
        socket.on("send-message", (data) => {
            const { groupId, userId, message } = data;

            const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
            connection.query(getUserQuery, [userId], (err, result) => {
                if (err || result.length === 0) return;
                const senderName = result[0].name;

                const insertQuery = "INSERT INTO group_messages (group_id, user_id, text) VALUES (?, ?, ?)";
                connection.query(insertQuery, [groupId, userId, message], (err) => {
                    if (err) {
                        console.error("Error storing message:", err);
                        return;
                    }
                    io.emit(`group-message-${groupId}`, { sender: senderName, text: message });
                });
            });
        });
    });

    return io;
}

module.exports = { initializeSocket }; 