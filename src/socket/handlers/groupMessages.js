const { EVENTS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    socket.on(EVENTS.GROUP_MESSAGE, async (msg) => {
        try {
            const message = {
                group_id: msg.groupId,
                sender_id: msg.senderId,
                text: msg.text,
                timestamp: new Date()
            };

            const messageId = await msgManager.saveGroupMessage(message);
            const fullMessage = {
                ...msg,
                id: messageId,
                tempId: msg.id
            };

            io.emit(`group-message-${message.group_id}`, fullMessage);
        } catch (error) {
            console.error('Error handling group message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send group message' });
        }
    });
}; 