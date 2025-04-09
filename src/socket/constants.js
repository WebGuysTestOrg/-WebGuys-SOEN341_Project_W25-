module.exports = {
    INACTIVITY_TIME: 30000,
    ROOMS: {
        GLOBAL_CHAT: 'global-chat',
        GROUP_ROOM: (groupId) => `group-room-${groupId}`,
        GROUP_MESSAGE: (groupId) => `group-message-${groupId}`,
        CHANNEL_ROOM: (teamId, channelId) => `channel-${teamId}-${channelId}`
    },
    EVENTS: {
        // Message Events
        GLOBAL_MESSAGE: 'global-message',
        PRIVATE_MESSAGE: 'private-message',
        CHANNEL_MESSAGE: 'ChannelMessages',
        GROUP_MESSAGE: 'send-message',
        MESSAGE_REMOVED: 'message-removed',
        
        // User Status Events
        USER_ONLINE: 'userOnline',
        USER_AWAY: 'userAway',
        STATUS_UPDATE: 'requestStatusUpdate',
        UPDATE_USER_STATUS: 'updateUserStatus',
        
        // System Events
        DISCONNECT: 'disconnect',
        ERROR: 'error',
        GLOBAL_CHAT_HISTORY: 'global-chat-history'
    }
}; 