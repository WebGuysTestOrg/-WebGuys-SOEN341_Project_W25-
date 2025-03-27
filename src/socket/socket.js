const { Server } = require("socket.io");
const config = require("../config/config");
const connection = require("../database/connection");

const onlineUsers = new Map();
const awayUsers = new Map();

function initializeSocket(server, sessionMiddleware) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:3000",
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Use session middleware for socket connections
    io.use((socket, next) => {
        sessionMiddleware(socket.request, {}, next);
    });

    io.on('connection', (socket) => {
        const session = socket.request.session;
        
        if (!session || !session.user) {
            console.log('Unauthorized socket connection attempt');
            socket.disconnect();
            return;
        }

        console.log(`User ${session.user.name}(${session.user.id}) connected`);
        
        // Store user info in socket
        socket.userId = session.user.id;
        socket.userName = session.user.name;

        // Add user to online users
        onlineUsers.set(session.user.id, socket.id);
        awayUsers.delete(session.user.id);

        // Emit updated user status
        io.emit('updateUserStatus', {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User ${socket.userName}(${socket.userId}) disconnected`);
            onlineUsers.delete(socket.userId);
            awayUsers.delete(socket.userId);
            
            // Emit updated user status
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        // Handle messages
        socket.on('message', (data) => {
            io.emit('message', {
                text: data.text,
                user: socket.userName,
                userID: socket.userId
            });
        });

        // Handle user status
        socket.on('userOnline', (userId) => {
            onlineUsers.set(userId, socket.id);
            awayUsers.delete(userId);
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        socket.on('userAway', (userId) => {
            awayUsers.set(userId, socket.id);
            onlineUsers.delete(userId);
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        // Private messaging
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

        // Channel messages
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

        // Group messages
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