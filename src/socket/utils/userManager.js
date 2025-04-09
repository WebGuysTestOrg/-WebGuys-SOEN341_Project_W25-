const { INACTIVITY_TIME } = require('../constants');

class UserManager {
    constructor() {
        this.onlineUsers = new Map();
        this.awayUsers = new Map();
        this.inactivityTimers = new Map();
    }

    setOnline(userId, socketId) {
        this.onlineUsers.set(userId, socketId);
        this.awayUsers.delete(userId);
        this.resetInactivityTimer(userId);
    }

    setAway(userId, socketId) {
        this.awayUsers.set(userId, socketId);
        this.onlineUsers.delete(userId);
    }

    removeUser(userId) {
        this.onlineUsers.delete(userId);
        this.awayUsers.delete(userId);
        this.clearInactivityTimer(userId);
    }

    resetInactivityTimer(userId) {
        this.clearInactivityTimer(userId);
        const timer = setTimeout(() => {
            this.setAway(userId, this.onlineUsers.get(userId));
        }, INACTIVITY_TIME);
        this.inactivityTimers.set(userId, timer);
    }

    clearInactivityTimer(userId) {
        if (this.inactivityTimers.has(userId)) {
            clearTimeout(this.inactivityTimers.get(userId));
            this.inactivityTimers.delete(userId);
        }
    }

    getStatusUpdate() {
        return {
            online: Array.from(this.onlineUsers.keys()),
            away: Array.from(this.awayUsers.keys())
        };
    }
}

module.exports = new UserManager(); 