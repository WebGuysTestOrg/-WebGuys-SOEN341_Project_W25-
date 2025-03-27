// Global Chat and User Status Management
class GlobalChat {
    constructor() {
        this.socket = io();
        this.messages = [];
        this.loggedInUserId = null;
        this.loggedInUser = null;
        this.inactivityTimer = null;
        this.INACTIVITY_TIME = 30000;
        this.isTyping = false;
        this.typingTimeout = null;
    }

    initializeElements() {
        // Get all required elements
        const elements = {
            chatToggle: document.getElementById("chat-toggle"),
            chatContainer: document.getElementById("chat-container"),
            closeChat: document.getElementById("close-chat"),
            sendButton: document.getElementById("send"),
            messageInput: document.getElementById("message"),
            chatMessages: document.getElementById("chat-messages"),
            statusToggle: document.getElementById("status-toggle"),
            statusContainer: document.getElementById("status-container"),
            closeStatus: document.getElementById("close-status"),
            emojiButton: document.getElementById("emoji-btn"),
            emojiPicker: document.getElementById("emoji-picker-container"),
            usersStatus: document.getElementById("users-status")
        };

        // Verify all elements are found
        let missingElements = [];
        for (let [key, element] of Object.entries(elements)) {
            if (!element) {
                missingElements.push(key);
            }
        }

        if (missingElements.length > 0) {
            console.error('Missing elements:', missingElements);
            return null;
        }

        this.elements = elements;
        return true;
    }

    setupEventListeners() {
        if (!this.elements) {
            console.error('Elements not initialized');
            return;
        }

        // Chat panel toggle with animation
        this.elements.chatToggle.addEventListener("click", () => {
            this.elements.chatContainer.classList.add('active');
            this.animateElement(this.elements.chatToggle, 'scale-out');
        });

        this.elements.closeChat.addEventListener("click", () => {
            this.elements.chatContainer.classList.remove('active');
            setTimeout(() => {
                this.animateElement(this.elements.chatToggle, 'scale-in');
            }, 300);
        });

        // Status panel toggle
        this.elements.statusToggle.addEventListener("click", () => {
            console.log('Status toggle clicked');
            this.toggleStatus(true);
        });

        this.elements.closeStatus.addEventListener("click", () => {
            console.log('Close status clicked');
            this.toggleStatus(false);
        });

        // Typing indicator
        this.elements.messageInput.addEventListener('input', () => {
            if (!this.isTyping) {
                this.isTyping = true;
                this.socket.emit('typing', { user: this.loggedInUser });
            }
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.isTyping = false;
                this.socket.emit('stopTyping', { user: this.loggedInUser });
            }, 1000);
        });

        // Message sending with animation
        this.elements.sendButton.addEventListener("click", () => this.sendMessageWithAnimation());
        this.elements.messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") this.sendMessageWithAnimation();
        });

        // Emoji picker
        this.elements.emojiButton.addEventListener("click", (e) => this.toggleEmojiPicker(e));
        document.addEventListener("click", (e) => this.handleClickOutsideEmoji(e));

        // Socket events with enhanced handling
        this.socket.on("message", (msg) => this.handleIncomingMessage(msg, true));
        this.socket.on("typing", (data) => this.showTypingIndicator(data.user));
        this.socket.on("stopTyping", (data) => this.hideTypingIndicator(data.user));
        this.socket.on("updateUserStatus", ({ online, away }) => this.handleStatusUpdate(online, away));
    }

    animateElement(element, animation) {
        element.classList.add(animation);
        element.addEventListener('animationend', () => {
            element.classList.remove(animation);
        }, { once: true });
    }

    sendMessageWithAnimation() {
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.socket.emit('message', { text });
            this.elements.messageInput.value = '';
            this.animateElement(this.elements.sendButton, 'button-press');
        }
    }

    showTypingIndicator(user) {
        if (user !== this.loggedInUser) {
            const typingDiv = document.createElement('div');
            typingDiv.classList.add('typing-indicator');
            typingDiv.innerHTML = `${user} is typing...`;
            this.elements.chatMessages.appendChild(typingDiv);
            setTimeout(() => typingDiv.remove(), 3000);
        }
    }

    hideTypingIndicator(user) {
        const typingIndicators = document.querySelectorAll('.typing-indicator');
        typingIndicators.forEach(indicator => {
            if (indicator.textContent.includes(user)) {
                indicator.remove();
            }
        });
    }

    handleIncomingMessage(msg, animate = false) {
        const messageElement = document.createElement("div");
        const isOwnMessage = this.loggedInUserId === msg.userID;
        
        messageElement.classList.add(isOwnMessage ? "my-message" : "other-message");
        if (animate) {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(20px)';
        }
        
        messageElement.innerHTML = `
            <div class="message-content">
                ${!isOwnMessage ? `<div class="message-sender">${msg.user}</div>` : ''}
                <div class="message-text">${this.formatMessage(msg.text)}</div>
                <div class="message-time">${this.formatTime(new Date())}</div>
            </div>
        `;
        
        this.elements.chatMessages.appendChild(messageElement);
        
        if (animate) {
            requestAnimationFrame(() => {
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
            });
        }
        
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        this.addMessage(msg.user, msg.text, msg.userID);
    }

    formatMessage(text) {
        // Convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    toggleChat(show) {
        console.log('Toggling chat:', show);
        if (!this.elements.chatContainer) {
            console.error('Chat container not found');
            return;
        }

        this.elements.chatContainer.style.left = show ? "0" : "-700px";
        this.elements.chatToggle.style.display = show ? "none" : "block";
        this.elements.statusToggle.style.display = show ? "none" : "block";

        if (!show) {
            setTimeout(() => {
                this.elements.chatToggle.style.display = "block";
                this.elements.statusToggle.style.display = "block";
            }, 300);
        }
    }

    toggleStatus(show) {
        this.elements.statusContainer.style.left = show ? "0" : "-300px";
        this.elements.chatToggle.style.display = show ? "none" : "block";
        this.elements.statusToggle.style.display = show ? "none" : "block";
        if (!show) {
            setTimeout(() => {
                this.elements.chatToggle.style.display = "block";
                this.elements.statusToggle.style.display = "block";
            }, 300);
        }
    }

    loadStoredMessages() {
        const storedMessages = JSON.parse(sessionStorage.getItem("chatMessages")) || [];
        this.messages = storedMessages;
        this.displayMessages(this.messages);
    }

    displayMessages(messages) {
        this.elements.chatMessages.innerHTML = '';
        messages.forEach(msg => {
            const messageElement = document.createElement("div");
            messageElement.classList.add(msg.senderID === this.loggedInUserId ? "my-message" : "other-message");
            messageElement.textContent = msg.senderID === this.loggedInUserId ? msg.text : `${msg.sender}: ${msg.text}`;
            this.elements.chatMessages.appendChild(messageElement);
        });
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    addMessage(sender, text, senderID) {
        const newMessage = {
            id: this.messages.length + 1,
            text,
            sender,
            senderID,
            timestamp: Date.now()
        };
        this.messages.push(newMessage);
        sessionStorage.setItem("chatMessages", JSON.stringify(this.messages));
    }

    handleStatusUpdate(online, away) {
        fetch("/api/users")
            .then(response => response.json())
            .then(data => {
                this.updateUserStatusUI(data.all_users, online, away, data.user_logout_times);
            });
    }

    updateUserStatusUI(allUsers, onlineUsers, awayUsers, logoutTimes) {
        this.elements.usersStatus.innerHTML = "";
        allUsers.forEach(user => {
            const isOnline = onlineUsers.includes(user.name);
            const isAway = awayUsers.includes(user.name);
            const userDiv = document.createElement("div");
            userDiv.classList.add("user-status");

            let statusText = "Offline";
            let statusClass = "offline";
            let logoutTimestamp = "";
            let statusIcon = `<i class="fas fa-circle-xmark offline-icon"></i>`;

            if (isOnline) {
                statusText = "Available";
                statusClass = "online";
                statusIcon = `<i class="fas fa-circle-check online-icon"></i>`;
            } else if (isAway) {
                statusText = "Away";
                statusClass = "away";
                statusIcon = `<i class="fas fa-clock away-icon"></i>`;
            } else {
                const userLogout = logoutTimes.find(logout => logout.name === user.name);
                if (userLogout && userLogout.last_logout) {
                    logoutTimestamp = ` (Since: ${new Date(userLogout.last_logout).toLocaleString()})`;
                }
            }

            userDiv.innerHTML = `
                <span class="user-name">${user.name}</span>
                <span class="status ${statusClass}">
                    ${statusIcon} ${statusText}${logoutTimestamp}
                </span>
            `;
            this.elements.usersStatus.appendChild(userDiv);
        });
    }

    toggleEmojiPicker(event) {
        event.stopPropagation();
        if (this.elements.emojiPicker.style.display === "none" || this.elements.emojiPicker.innerHTML === "") {
            this.elements.emojiPicker.style.display = "block";
            this.elements.emojiPicker.innerHTML = "";

            const picker = new EmojiMart.Picker({
                set: 'apple',
                onEmojiSelect: (emoji) => {
                    this.elements.messageInput.value += emoji.native || emoji.colons || emoji.id;
                    this.elements.emojiPicker.style.display = "none";
                }
            });

            this.elements.emojiPicker.appendChild(picker);
        } else {
            this.elements.emojiPicker.style.display = "none";
        }
    }

    handleClickOutsideEmoji(event) {
        if (
            this.elements.emojiPicker.style.display === "block" &&
            !this.elements.emojiPicker.contains(event.target) &&
            event.target !== this.elements.emojiButton
        ) {
            this.elements.emojiPicker.style.display = "none";
        }
    }

    resetInactivityTimer(userId) {
        clearTimeout(this.inactivityTimer);
        this.socket.emit("userOnline", userId);
        this.inactivityTimer = setTimeout(() => {
            this.socket.emit("userAway", userId);
        }, this.INACTIVITY_TIME);
    }

    initialize() {
        console.log('Initializing GlobalChat');
        
        // Initialize elements first
        if (!this.initializeElements()) {
            console.error('Failed to initialize elements');
            return;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Load stored messages
        this.loadStoredMessages();

        const endpoint = window.location.pathname.includes('admin') ? '/admin-info' : '/user-info';
        
        fetch(endpoint)
            .then(response => {
                if (!response.ok) throw new Error('Unauthorized');
                return response.json();
            })
            .then(data => {
                this.loggedInUser = data.name;
                this.loggedInUserId = data.id;
                
                // Update name display based on page type
                if (window.location.pathname.includes('admin')) {
                    const adminName = document.getElementById('admin-name');
                    if (adminName) adminName.textContent = data.name;
                } else {
                    const userName = document.getElementById('username');
                    if (userName) userName.textContent = data.name;
                }

                document.addEventListener("click", () => this.resetInactivityTimer(data.name));
                document.addEventListener("keydown", () => this.resetInactivityTimer(data.name));
                this.socket.emit("userOnline", data.name);

                // Role-based redirection
                if (data.role === "user" && window.location.pathname.includes('admin')) {
                    window.location.href = "/user_page.html";
                } else if (data.role === "admin" && !window.location.pathname.includes('admin')) {
                    window.location.href = "/admin_page.html";
                }
            })
            .catch(() => window.location.href = '/login_form.html');
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes scale-out {
        0% { transform: scale(1); }
        100% { transform: scale(0); }
    }
    
    @keyframes scale-in {
        0% { transform: scale(0); }
        100% { transform: scale(1); }
    }
    
    @keyframes button-press {
        0% { transform: scale(1); }
        50% { transform: scale(0.95); }
        100% { transform: scale(1); }
    }
    
    .scale-out {
        animation: scale-out 0.3s forwards;
    }
    
    .scale-in {
        animation: scale-in 0.3s forwards;
    }
    
    .button-press {
        animation: button-press 0.2s forwards;
    }
    
    .typing-indicator {
        padding: 0.5rem;
        color: var(--dark-grey);
        font-style: italic;
        font-size: 0.9rem;
    }
    
    .message-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .message-sender {
        font-size: 0.8rem;
        font-weight: bold;
        color: var(--dark-grey);
    }
    
    .message-time {
        font-size: 0.7rem;
        color: var(--dark-grey);
        align-self: flex-end;
    }
`;

document.head.appendChild(style);

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating GlobalChat instance');
    const globalChat = new GlobalChat();
    globalChat.initialize();
}); 