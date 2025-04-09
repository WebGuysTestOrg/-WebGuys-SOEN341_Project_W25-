const { EVENTS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    socket.on(EVENTS.PRIVATE_MESSAGE, async (msg) => {
        try {
            // Store the client-generated message ID
            const tempId = msg.id;
            
            // Use only the fields present in schema.sql
            const message = {
                sender_id: msg.senderId,
                recipient_id: msg.recipientId,
                text: msg.text,
                timestamp: new Date()
            };

            const messageId = await msgManager.savePrivateMessage(message);
            
            // Send back the full message including the quoted data, but only store essential fields in DB
            const fullMessage = {
                ...msg,
                id: messageId,
                tempId: tempId, // Return the tempId so client can match it
                quoted: msg.quoted // Keep this for UI, but don't store in DB
            };

            // Emit to all connected clients
            io.emit(EVENTS.PRIVATE_MESSAGE, fullMessage);
        } catch (error) {
            console.error('Error handling private message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send private message' });
        }
    });
}; 