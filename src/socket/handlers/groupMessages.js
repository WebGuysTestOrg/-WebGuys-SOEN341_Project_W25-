const { EVENTS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    // Listen for the group message event
    socket.on("send-message", async (msg) => {
        try {
            console.log('Received group message:', msg);
            
            // Validate message data
            if (!msg || !msg.groupId || !msg.userId || !msg.message) {
                console.error('Invalid message format:', msg);
                socket.emit(EVENTS.ERROR, { message: 'Invalid message format' });
                return;
            }
            
            const message = {
                group_id: msg.groupId,
                user_id: msg.userId,
                text: msg.message,
                is_system_message: false
            };

            const messageId = await msgManager.saveGroupMessage(message);
            
            // Get the user's name for the message display
            connection.query(
                "SELECT name FROM user_form WHERE id = ?", 
                [msg.userId],
                (err, results) => {
                    if (err) {
                        console.error('Error fetching user name:', err);
                        return;
                    }
                    
                    const userName = results.length > 0 ? results[0].name : 'Unknown User';
                    
                    // Create properly formatted message for the client
                    const fullMessage = {
                        id: messageId,
                        sender: userName,
                        text: msg.message,
                        is_system_message: false
                    };
                    
                    console.log(`Emitting message to group-${msg.groupId}:`, fullMessage);
                    
                    // Use io.emit to ensure all clients receive the message
                    io.emit(`group-message-${msg.groupId}`, fullMessage);
                }
            );
        } catch (error) {
            console.error('Error handling group message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send group message' });
        }
    });
    
    // Join the group chat room when user opens a group chat
    socket.on('join-group', (groupId) => {
        console.log(`User ${socket.id} joined group-${groupId}`);
        socket.join(`group-${groupId}`);
    });
    
    // Leave the group chat room when user leaves
    socket.on('leave-group', (groupId) => {
        console.log(`User ${socket.id} left group-${groupId}`);
        socket.leave(`group-${groupId}`);
    });
}; 