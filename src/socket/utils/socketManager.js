const { Server } = require('socket.io');
const { INACTIVITY_TIME } = require('../constants');
const userManager = require('./userManager');

// Storage for online/away status
const onlineUsers = new Map();
const awayUsers = new Map();
const userInactivityTimers = new Map();

// Initialize socket.io server
function initializeSocketServer(expressServer, sessionMiddleware, sharedSession, connection) {
    const io = new Server(expressServer, {
        cors: {
            origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"]
        }
    });

    // Use the imported sessionMiddleware for Socket.IO
    io.use(sharedSession(sessionMiddleware, {
        autoSave: true,
    }));

    // Socket connection handling
    io.on('connection', socket => {
        console.log('New socket connection:', socket.id);

        const session = socket.handshake.session;

        if (!session?.user?.name) {
            console.log(`Unauthorized connection attempt - disconnecting socket ${socket.id}`);
            socket.disconnect();
            return;
        }

        initializeSocket(socket, session, io, connection);
        setupSocketEventHandlers(socket, io, connection);
    });

    return io;
}

// Socket initialization
function initializeSocket(socket, session, io, connection) {
    console.log(`User ${session.user.name} connected (${session.user.user_type})`);
    socket.userId = session.user.id;
    socket.userName = session.user.name;
    socket.userType = session.user.user_type;
    
    // Join global chat room
    socket.join('global-chat');
    
    // Initialize socket handlers
    require('../handlers/globalChat')(socket, io, connection);
    require('../handlers/privateMessages')(socket, io, connection);
    require('../handlers/groupMessages')(socket, io, connection);
    require('../handlers/channelMessages')(socket, io, connection);
}

// Helper function to fetch user names
async function fetchUserNames(userIds, connection) {
    if (userIds.length === 0) return [];
    const placeholders = userIds.map(() => '?').join(', ');
    const sql = `SELECT name FROM user_form WHERE id IN (${placeholders})`;
    
    return new Promise((resolve, reject) => {
        connection.query(sql, userIds, (err, results) => {
            if (err) return reject(err);
            resolve(results.map(row => row.name));
        });
    });
}

// Timer management functions
function startInactivityTimer(socket, userId) {
    if (userInactivityTimers.has(userId)) {
        clearTimeout(userInactivityTimers.get(userId));
    }
    
    const timer = setTimeout(() => {
        console.log(`User ${userId} is now away due to inactivity`);
        socket.emit("userAway", userId);
    }, INACTIVITY_TIME);
    
    userInactivityTimers.set(userId, timer);
}

function resetInactivityTimer(socket, userId) {
    clearTimeout(userInactivityTimers.get(userId));
    startInactivityTimer(socket, userId);
    console.log(`Reset inactivity timer for user ${userId}`);
}

// Status update handling
async function handleStatusUpdate(socket, io, userId, connection) {
    try {
        const [onlineNames, awayNames] = await Promise.all([
            fetchUserNames(Array.from(onlineUsers.keys()), connection),
            fetchUserNames(Array.from(awayUsers.keys()), connection)
        ]);
        
        io.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            online_names: onlineNames,
            away: Array.from(awayUsers.keys()),
            away_names: awayNames
        });
        
        resetInactivityTimer(socket, userId.toString());
    } catch (err) {
        console.error('Error fetching user names:', err);
    }
}

// Setup socket event handlers
function setupSocketEventHandlers(socket, io, connection) {
    socket.on("userOnline", async (userId) => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as ONLINE (socket: ${socket.id}, type: ${socket.userType})`);
        
        onlineUsers.set(userIdStr, socket.id);
        awayUsers.delete(userIdStr);
        
        await handleStatusUpdate(socket, io, userId, connection);
    });

    socket.on("userAway", async (userId) => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to update status' });
            return;
        }
        
        const userIdStr = userId.toString();
        console.log(`Setting user ${userIdStr} as AWAY (socket: ${socket.id})`);
        
        awayUsers.set(userIdStr, socket.id);
        onlineUsers.delete(userIdStr);
        
        await handleStatusUpdate(socket, io, userId, connection);
    });

    socket.on("requestStatusUpdate", () => {
        if (!socket?.userId) {
            socket.emit('error', { message: 'You must be logged in to request status updates' });
            return;
        }
        
        socket.emit("updateUserStatus", {
            online: Array.from(onlineUsers.keys()),
            away: Array.from(awayUsers.keys())
        });
    });

    socket.on("disconnect", () => handleDisconnect(socket, io));
}

// Handle socket disconnection
function handleDisconnect(socket, io) {
    console.log(`User ${socket.id} disconnected`);
    let disconnectedUserId = null;
    
    onlineUsers.forEach((socketId, userId) => {
        if (socketId === socket.id) {
            disconnectedUserId = userId;
            console.log(`User ${userId} is now offline (was online)`);
            onlineUsers.delete(userId);
        }
    });
    
    if (!disconnectedUserId) {
        awayUsers.forEach((socketId, userId) => {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                console.log(`User ${userId} is now offline (was away)`);
                awayUsers.delete(userId);
            }
        });
    }
    
    if (disconnectedUserId && userInactivityTimers.has(disconnectedUserId)) {
        clearTimeout(userInactivityTimers.get(disconnectedUserId));
        userInactivityTimers.delete(disconnectedUserId);
    }
    
    io.emit("updateUserStatus", {
        online: Array.from(onlineUsers.keys()),
        away: Array.from(awayUsers.keys())
    });
}

module.exports = {
    initializeSocketServer
}; 