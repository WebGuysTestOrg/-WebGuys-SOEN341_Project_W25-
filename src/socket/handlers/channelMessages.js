const { EVENTS } = require('../constants');
const messageManager = require('../utils/messageManager');

module.exports = (socket, io, connection) => {
    const msgManager = new messageManager(connection);

    // Handle joining a channel room
    socket.on("join-channel", (data) => {
        const roomName = `channel-room-${data.teamName}-${data.channelName}`;
        socket.join(roomName);
    });

    // Handle leaving a channel room
    socket.on("leave-channel", (data) => {
        const roomName = `channel-room-${data.teamName}-${data.channelName}`;
        socket.leave(roomName);
    });

    socket.on(EVENTS.CHANNEL_MESSAGE, async (msg) => {
        try {
            // Store the client-generated message ID
            const tempId = msg.id;
            
            // Use only the fields present in schema.sql
            const message = {
                team_name: msg.teamName,
                channel_name: msg.channelName,
                sender: msg.sender,
                text: msg.text,
                quoted_message: msg.quoted
            };

            const messageId = await msgManager.saveChannelMessage(message);
            
            // Send back the full message including the quoted data, but only store essential fields in DB
            const fullMessage = {
                ...msg,
                id: messageId,
                tempId: tempId, // Return the tempId so client can match it
                quoted: msg.quoted // Keep this for UI, but don't store in DB
            };

            // Emit to the specific channel room
            const roomName = `channel-room-${msg.teamName}-${msg.channelName}`;
            io.to(roomName).emit(EVENTS.CHANNEL_MESSAGE, fullMessage);
        } catch (error) {
            console.error('Error handling channel message:', error);
            socket.emit(EVENTS.ERROR, { message: 'Failed to send channel message' });
        }
    });
}; 