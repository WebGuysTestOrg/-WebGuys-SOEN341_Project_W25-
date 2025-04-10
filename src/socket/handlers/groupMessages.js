const { EVENTS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    socket.on(EVENTS.GROUP_MESSAGE, async (msg) => {
        try {
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
        
                    io.emit(`group-message-${msg.groupId}`, fullMessage);
                }
            );
        } catch (error) {
            console.error('Error handling group message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send group message' });
        }
    });
}; 