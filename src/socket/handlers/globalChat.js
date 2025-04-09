const { EVENTS, ROOMS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    // Send chat history when user connects
    socket.on('connection', async () => {
        try {
            const messages = await msgManager.getGlobalMessages();
            socket.emit(EVENTS.GLOBAL_CHAT_HISTORY, messages.reverse());
        } catch (error) {
            console.error('Error fetching global messages:', error);
        }
    });

    // Handle new global messages
    socket.on(EVENTS.GLOBAL_MESSAGE, async (data) => {
        try {
            const message = {
                sender_id: socket.userId,
                sender_name: socket.userName,
                message: data.text,
                quoted_text: data.quoted_text,
                quoted_sender: data.quoted_sender,
                timestamp: new Date()
            };

            const messageId = await msgManager.saveGlobalMessage(message);
            message.id = messageId;

            io.to(ROOMS.GLOBAL_CHAT).emit(EVENTS.GLOBAL_MESSAGE, message);
        } catch (error) {
            console.error('Error handling global message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send message' });
        }
    });
}; 