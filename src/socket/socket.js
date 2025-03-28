const { Server } = require("socket.io");
const config = require("../config/config");
const connection = require("../database/connection");

const onlineUsers = new Map();
const awayUsers = new Map();

function initializeSocket(server, sessionMiddleware) {
    console.log('Initializing socket server...');
    
    const io = new Server(server, {
        cors: {
            origin: config.CORS_ORIGINS,
            credentials: true,
            methods: ["GET", "POST"]
        },
        ...config.SOCKET_CONFIG,
        allowEIO3: true
    });

    // Wrap session middleware
    const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

    // Use session middleware for socket connections
    io.use(wrap(sessionMiddleware));

    // Add authentication middleware
    io.use((socket, next) => {
        console.log('Socket authentication attempt...');
        const session = socket.request.session;
        if (session && session.user) {
            console.log('Socket authenticated for user:', session.user.name);
            next();
        } else {
            console.log('Socket authentication failed - no session or user');
            next(new Error('Unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        console.log('New socket connection attempt...');
        const session = socket.request.session;
        
        if (!session || !session.user) {
            console.log('Connection rejected - no session or user');
            socket.disconnect();
            return;
        }
        
        console.log('User connected:', session.user.name);
        
        // Store user info in socket
        socket.userId = session.user.id;
        socket.userName = session.user.name;

        // Add user to online users
        onlineUsers.set(session.user.id, socket.id);
        awayUsers.delete(session.user.id);

        // Send initial connection success
        socket.emit('connect_success', {
            userId: socket.userId,
            userName: socket.userName
        });

        // Emit updated user status
        io.emit('updateUserStatus', {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.userName);
            onlineUsers.delete(socket.userId);
            awayUsers.delete(socket.userId);
            
            // Emit updated user status
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        // Handle messages
        socket.on('chat message', (data) => {
            if (!socket.userId) {
                console.log('Message rejected - no socket.userId found');
                return;
            }
            
            console.log('Received chat message from', socket.userName, ':', data);
            
            // Broadcast the message to all connected clients
            const messageData = {
                text: data.text,
                user: socket.userName,
                timestamp: data.timestamp,
                quotedMessage: data.quotedMessage
            };
            
            console.log('Broadcasting message to all clients:', messageData);
            io.emit('chat message', messageData);
        });

        // Handle user status
        socket.on('userOnline', (userId) => {
            if (userId !== socket.userId) return;
            
            onlineUsers.set(userId, socket.id);
            awayUsers.delete(userId);
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        socket.on('userAway', (userId) => {
            if (userId !== socket.userId) return;
            
            awayUsers.set(userId, socket.id);
            onlineUsers.delete(userId);
            io.emit('updateUserStatus', {
                online: Array.from(onlineUsers.keys()),
                away: Array.from(awayUsers.keys())
            });
        });

        // Private messaging
        socket.on("private-message", (msg) => {
            if (!socket.userId) return;
            
            const insertQuery = "INSERT INTO direct_messages (sender_id, recipient_id, text, quoted_message) VALUES (?, ?, ?, ?)";
            const quotedText = msg.quoted ? msg.quoted.text : null;
            connection.query(insertQuery, [msg.senderId, msg.recipientId, msg.text, quotedText], (err) => {
                if (err) return;
                const fullMessage = {
                    ...msg,
                    quoted: msg.quoted
                };
                io.emit("private-message", fullMessage);
            });
        });

        // Channel messages
        socket.on("ChannelMessages", (msg) => {
            if (!socket.userId) return;
            
            const query = `
                INSERT INTO channels_messages (team_name, channel_name, sender, text, quoted_message) 
                VALUES (?, ?, ?, ?, ?)
            `;

            connection.query(query, [msg.teamName, msg.channelName, msg.sender, msg.text, msg.quoted], (err, result) => {
                if (err) return;
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
            if (!socket.userId) return;
            
            const { groupId, userId, message } = data;
            if (userId !== socket.userId) return;

            const getUserQuery = "SELECT name FROM user_form WHERE id = ?";
            connection.query(getUserQuery, [userId], (err, result) => {
                if (err || result.length === 0) return;
                const senderName = result[0].name;

                const insertQuery = "INSERT INTO group_messages (group_id, user_id, text) VALUES (?, ?, ?)";
                connection.query(insertQuery, [groupId, userId, message], (err) => {
                    if (err) return;
                    io.emit(`group-message-${groupId}`, { sender: senderName, text: message });
                });
            });
        });

        // Keep session alive
        const keepAliveInterval = setInterval(() => {
            if (socket.request.session) {
                socket.request.session.touch();
                socket.request.session.save();
            }
        }, 5 * 60 * 1000);

        socket.on('disconnect', () => {
            clearInterval(keepAliveInterval);
        });
    });

    return io;
}

module.exports = { initializeSocket }; 