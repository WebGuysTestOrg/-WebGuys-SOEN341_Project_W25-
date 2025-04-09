const socket = io('ws://localhost:3000');
let loggedInUserId = null;
let loggedInUserName = "";
let quotedMessage = null;
let currentRecipientId = null;
let currentRecipientName = null;
let onlineUsers = [];
let awayUsers = [];
let ChatMessageToExport={};
// Handle URL parameters for direct navigation
const urlParams = new URLSearchParams(window.location.search);
const directMessageUser = urlParams.get('user');

// Mobile UI handling
const mobileToggleBtn = document.getElementById('mobile-toggle');
const sidebar = document.querySelector('.sidebar');

// Check if on mobile device
function isMobile() {
    return window.innerWidth <= 768;
}

// Toggle sidebar visibility on mobile
mobileToggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    mobileToggleBtn.classList.toggle('active');
});

// Close sidebar when clicking a chat on mobile
function initMobileInteraction() {
    document.querySelectorAll('#chat-list li').forEach(chatItem => {
        chatItem.addEventListener('click', () => {
            if (isMobile()) {
                sidebar.classList.remove('active');
                mobileToggleBtn.classList.remove('active');
            }
        });
    });
}

// Handle window resize
window.addEventListener('resize', () => {
    if (!isMobile()) {
        sidebar.classList.remove('active');
        mobileToggleBtn.classList.remove('active');
    }
});

// Initialize emoji picker
document.getElementById("emoji-btn").addEventListener("click", function (event) {
    event.stopPropagation();
    const pickerContainer = document.getElementById("emoji-picker-container");

    if (pickerContainer.style.display === "none" || pickerContainer.innerHTML === "") {
        pickerContainer.style.display = "block";
        pickerContainer.innerHTML = "";

        const picker = new EmojiMart.Picker({
            set: 'apple',
            onEmojiSelect: (emoji) => {
                const messageInput = document.getElementById("message");
                messageInput.value += emoji.native || emoji.colons || emoji.id;
                messageInput.focus();
                pickerContainer.style.display = "none";
            }
        });

        pickerContainer.appendChild(picker);
    } else {
        pickerContainer.style.display = "none";
    }
});

// Close emoji picker when clicking outside
document.addEventListener("click", function (event) {
    const pickerContainer = document.getElementById("emoji-picker-container");
    const emojiButton = document.getElementById("emoji-btn");

    if (
        pickerContainer.style.display === "block" &&
        !pickerContainer.contains(event.target) &&
        event.target !== emojiButton
    ) {
        pickerContainer.style.display = "none";
    }
});

// Back button functionality
document.getElementById("back-btn").addEventListener("click", () => {
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            window.location.href = data.role === "admin" ? "/admin_page.html" : "/UserDashboard.html";
        })
        .catch(() => window.location.href = "/UserDashboard.html");
});

// Initialize user data
fetch('/user-info')
    .then(response => response.json())
    .then(data => {
        loggedInUserId = data.id;
        loggedInUserName = data.name;

        // Send online status to server immediately after getting user ID
        console.log("Sending online status for user ID:", loggedInUserId);
        socket.emit("userOnline", loggedInUserId.toString());

        // Set up automatic status refresh every 30 seconds
        setInterval(() => {
            socket.emit("userOnline", loggedInUserId.toString());
        }, 30000);

        fetchUserChats(directMessageUser);
    })
    .catch(() => window.location.href = '/Login-Form.html');

// Set up socket listeners for user status
socket.on("updateUserStatus", ({ online, away }) => {
    onlineUsers = online;
    awayUsers = away;
    
    // Update the status display for the current chat
    updateRecipientStatus();
    
    // Update the sidebar chat list to show status
    updateChatListStatus();
});

// Request current online status from server
socket.on('connect', () => {
    socket.emit("requestStatusUpdate");
});

// Function to update current recipient's status
function updateRecipientStatus() {
    if (!currentRecipientId) return;
    
    const statusSpan = document.querySelector('.chat-status');
    if (!statusSpan) return;
    
    const isOnline = onlineUsers.includes(currentRecipientId.toString());
    const isAway = awayUsers.includes(currentRecipientId.toString());
    
    if (isOnline) {
        statusSpan.innerHTML = '<i class="fas fa-circle online-status"></i> Online';
        statusSpan.className = 'chat-status online';
    } else if (isAway) {
        statusSpan.innerHTML = '<i class="fas fa-circle away-status"></i> Away';
        statusSpan.className = 'chat-status away';
    } else {
        statusSpan.innerHTML = '<i class="fas fa-circle offline-status"></i> Offline';
        statusSpan.className = 'chat-status offline';
    }
}

// Function to update status indicators in the chat list
function updateChatListStatus() {
    const chatItems = document.querySelectorAll('#chat-list li');
    
    chatItems.forEach(item => {
        const userId = item.dataset.recipientId;
        if (!userId) return;
        
        // Remove any existing status indicators
        const existingStatus = item.querySelector('.status-indicator');
        if (existingStatus) existingStatus.remove();
        
        // Create new status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.className = 'status-indicator';
        
        if (onlineUsers.includes(userId.toString())) {
            statusIndicator.classList.add('online');
        } else if (awayUsers.includes(userId.toString())) {
            statusIndicator.classList.add('away');
        } else {
            statusIndicator.classList.add('offline');
        }
        
        // Add the status indicator to the chat item avatar
        const avatar = item.querySelector('.chat-item-avatar');
        if (avatar) {
            avatar.appendChild(statusIndicator);
        }
    });
}

// Chat search functionality
document.getElementById('search-chats').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const chatItems = document.querySelectorAll('#chat-list li');
    
    chatItems.forEach(item => {
        const username = item.textContent.toLowerCase();
        if (username.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Fetch user's existing chats
function fetchUserChats(directChatUser = null) {
    fetch(`/get-user-chats?userId=${loggedInUserId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Error fetching chats: ' + response.status);
            }
            return response.json();
        })
        .then(chats => {
            const chatList = document.getElementById("chat-list");
            // Save current active chat if any
            const currentActive = currentRecipientId;
            // Store list of chats with unread messages
            const unreadChats = Array.from(document.querySelectorAll('#chat-list li.has-unread')).map(
                li => li.dataset.recipientId
            );
            
            chatList.innerHTML = "";
            
            chats.forEach(chat => {
                let chatItem = document.createElement("li");
                chatItem.innerHTML = `
                    <div class="chat-item-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="chat-item-details">
                        <span class="chat-item-name">${chat.username}</span>
                    </div>
                `;
                chatItem.dataset.recipientId = chat.user_id;
                chatItem.dataset.recipientName = chat.username;
                
                // Restore unread status if it had one before
                if (unreadChats.includes(chat.user_id.toString())) {
                    chatItem.classList.add('has-unread');
                }
                
                // Make active if this was the currently selected chat
                if (currentActive && chat.user_id.toString() === currentActive.toString()) {
                    chatItem.classList.add('active');
                }
                
                chatItem.addEventListener("click", () => {
                    // Highlight the selected chat
                    document.querySelectorAll('#chat-list li').forEach(item => {
                        item.classList.remove('active');
                    });
                    chatItem.classList.add('active');
                    
                    loadChat(chat.user_id, chat.username);
                });
                chatList.appendChild(chatItem);
                
                // If this chat matches the direct message user, select it
                if (directChatUser && chat.username === directChatUser) {
                    chatItem.click();
                }
            });
            
            // Initialize mobile interaction handlers
            initMobileInteraction();
            
            // Update online status for chat list
            updateChatListStatus();
            
            // If we have a direct message user but no matching chat, create a new chat
            if (directChatUser && !chats.some(chat => chat.username === directChatUser)) {
                initiateDirectChat(directChatUser);
            }
            
            // If we're on mobile and no chat is selected, show the sidebar
            if (isMobile() && !currentRecipientId) {
                sidebar.classList.add('active');
            }
        })
        .catch(err => {
            console.error("Error fetching chats:", err);
            // Show an error message to the user
            const chatList = document.getElementById("chat-list");
            chatList.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Unable to load conversations</p>
                    <button id="retry-chats-btn">Retry</button>
                </div>
            `;
            
            // Add retry functionality
            document.getElementById('retry-chats-btn')?.addEventListener('click', () => {
                fetchUserChats(directChatUser);
            });
        });
}

// Initiate a direct chat from URL parameter
function initiateDirectChat(username) {
    fetch(`/get-user-id?username=${username}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`User "${username}" not found.`);
            } else {
                startChat(data.userId, username);
            }
        })
        .catch(err => console.error("Error fetching user ID:", err));
}

// Create a new chat
document.getElementById("new-chat-btn").addEventListener("click", () => {
    const recipientName = prompt("Enter the username to chat with:");
    if (!recipientName) return;

    fetch(`/get-user-id?username=${recipientName}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`User "${recipientName}" not found.`);
            } else {
                startChat(data.userId, recipientName);
            }
        })
        .catch(err => console.error("Error fetching user ID:", err));
});

// Start a new chat with a user
function startChat(recipientId, recipientName) {
    if (!recipientId) return;
    
    // Check if chat already exists
    const existingChat = document.querySelector(`#chat-list li[data-recipient-id="${recipientId}"]`);
    if (existingChat) {
        existingChat.click();
        return;
    }

    // Initialize the chat in the database first
    fetch('/init-chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: loggedInUserId,
            recipientId: recipientId
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to initialize chat');
        }
        return response.json();
    })
    .then(() => {
        // After initializing, create UI elements
        const chatList = document.getElementById("chat-list");
        let chatItem = document.createElement("li");
        chatItem.innerHTML = `
            <div class="chat-item-avatar">
                <i class="fas fa-user-circle"></i>
            </div>
            <div class="chat-item-details">
                <span class="chat-item-name">${recipientName}</span>
            </div>
        `;
        chatItem.dataset.recipientId = recipientId;
        chatItem.dataset.recipientName = recipientName;
        
        chatItem.addEventListener("click", () => {
            // Highlight the selected chat
            document.querySelectorAll('#chat-list li').forEach(item => {
                item.classList.remove('active');
            });
            chatItem.classList.add('active');
            
            loadChat(recipientId, recipientName);
            
            // Close sidebar on mobile when a chat is selected
            if (isMobile()) {
                sidebar.classList.remove('active');
                mobileToggleBtn.classList.remove('active');
            }
        });
        
        chatList.prepend(chatItem); // Add new chat at the top
        chatItem.click(); // Automatically select the new chat
    })
    .catch(err => {
        console.error("Error initializing chat:", err);
        alert("Failed to start chat. Please try again.");
    });
}

// Load chat messages
function loadChat(recipientId, recipientName) {
    // First remove unread indicator if present
    const chatItem = document.querySelector(`#chat-list li[data-recipient-id="${recipientId}"]`);
    if (chatItem) {
        chatItem.classList.remove('has-unread');
    }
    
    currentRecipientId = recipientId;
    currentRecipientName = recipientName;
    
    // Update the chat header
    const chatHeader = document.querySelector('.chat-recipient-name');
    chatHeader.textContent = recipientName;
    document.getElementById("chat-header").dataset.recipientId = recipientId;
    
    // Update recipient status indicator
    updateRecipientStatus();
    
    // Clear messages and show loading indicator
    const chatMessages = document.getElementById("chat-messages");
    chatMessages.innerHTML = '<div class="loading-messages"><i class="fas fa-spinner fa-pulse"></i> Loading messages...</div>';

    fetch(`/get-messages?senderId=${loggedInUserId}&recipientId=${recipientId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Error fetching messages: ' + response.status);
            }
            return response.json();
        })
        .then(messages => {
            chatMessages.innerHTML = "";
            
            // Filter out system messages
            const userMessages = messages.filter(msg => msg.text !== "Chat initialized");
            
            if (userMessages.length === 0) {
                chatMessages.innerHTML = '<div class="no-messages">No messages yet. Say hello! 👋</div>';
            } else {
                let lastDate = '';
                exportChat=userMessages;
                userMessages.forEach(msg => {
                    // Add date separator if needed
                    const msgDate = new Date(msg.timestamp || Date.now()).toLocaleDateString();
                    if (msgDate !== lastDate) {
                        const dateSeparator = document.createElement('div');
                        dateSeparator.className = 'date-separator';
                        dateSeparator.textContent = formatDateSeparator(msgDate);
                        chatMessages.appendChild(dateSeparator);
                        lastDate = msgDate;
                    }
                    
                    displayMessage(msg, msg.senderId === loggedInUserId);
                });
            }
            
            // Scroll to the bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Focus the message input
            document.getElementById("message").focus();
        })
        .catch(err => {
            console.error("Error loading messages:", err);
            chatMessages.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to load messages. Please try again.</p>
                    <button id="retry-messages-btn">Retry</button>
                </div>
            `;
            
            // Add retry functionality
            document.getElementById('retry-messages-btn')?.addEventListener('click', () => {
                // Show loading indicator again
                chatMessages.innerHTML = '<div class="loading-messages"><i class="fas fa-spinner fa-pulse"></i> Loading messages...</div>';
                // Try loading messages again after a short delay
                setTimeout(() => loadChat(recipientId, recipientName), 500);
            });
        });
}

// Format date for message separators
function formatDateSeparator(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateString === today.toLocaleDateString()) {
        return 'Today';
    } else if (dateString === yesterday.toLocaleDateString()) {
        return 'Yesterday';
    } else {
        return new Date(dateString).toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
}

// Send a message
document.getElementById("send").addEventListener("click", () => {
    sendMessage();
});

document.getElementById("message").addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const messageInput = document.getElementById("message");
    const messageText = messageInput.value.trim();
    const recipientId = currentRecipientId;

    if (!messageText || !recipientId) return;

    // Create a unique ID for this message
    const tempId = `msg-${Date.now()}`;

    // Create the message object with quoted data if available
    const messageData = {
        id: tempId, // Add the ID to the message object so the server can return it
        senderId: loggedInUserId,
        senderName: loggedInUserName,
        recipientId: recipientId,
        text: messageText,
        quoted: quotedMessage,
        timestamp: new Date()
    };

    // First ensure the chat is initialized
    fetch('/init-chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: loggedInUserId,
            recipientId: recipientId
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to initialize chat');
        }
        return response.json();
    })
    .then(() => {
        // Show sent message immediately with pending status
        const pendingMsg = {...messageData, pending: true};
        displayMessage(pendingMsg, true);
        
        // Scroll to the bottom
        const chatMessages = document.getElementById("chat-messages");
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Send the message to the server
        socket.emit("private-message", messageData);
        
        // Clear input and reset quoted message state
        messageInput.value = "";
        quotedMessage = null;
        
        const quotedContainer = document.getElementById('quoted-message-container');
        if (quotedContainer) quotedContainer.style.display = 'none';
    })
    .catch(err => {
        console.error("Error ensuring chat exists:", err);
        alert("Failed to send message. Please try again.");
    });
}

// Display messages
socket.on("private-message", (msg) => {
    // Update chat list first to show unread message indicators
    if (msg.senderId !== loggedInUserId && msg.senderId !== currentRecipientId) {
        // Find existing chat item for this sender
        let chatItem = document.querySelector(`#chat-list li[data-recipient-id="${msg.senderId}"]`);
        
        if (chatItem) {
            // Add an unread indicator if it's not the current chat
            chatItem.classList.add('has-unread');
            
            // Move this chat to the top of the list
            const chatList = document.getElementById("chat-list");
            chatList.prepend(chatItem);
        } else {
            // If chat doesn't exist yet, reload the chat list
            fetchUserChats();
        }
        
        // Show notification
        showNotification(msg);
        return; // Don't update chat window for chats we're not viewing
    }
    
    // Handle message in current chat window
    if (msg.senderId == loggedInUserId || msg.recipientId == loggedInUserId) {
        // Only process message in chat window if it's for the current chat
        if (msg.senderId === currentRecipientId || msg.recipientId === currentRecipientId || msg.senderId === loggedInUserId) {
            // Try different ID formats for pending messages
            let pendingMessage = document.getElementById('msg-' + msg.id);
            exportChat.push(msg)
            // If not found, try looking for a message with tempId
            if (!pendingMessage && msg.tempId) {
                pendingMessage = document.getElementById(msg.tempId);
            }
            
            if (pendingMessage) {
                pendingMessage.classList.remove('pending');
                const statusElement = pendingMessage.querySelector('.message-status');
                if (statusElement) {
                    statusElement.innerHTML = '<i class="fas fa-check"></i>';
                }
            } else {
                // This is a new message
                
                displayMessage(msg, msg.senderId === loggedInUserId);
                
                // If this is from someone else in the current chat, scroll to bottom
                if (msg.senderId !== loggedInUserId) {
                    const chatMessages = document.getElementById("chat-messages");
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }
    }
});

function showNotification(msg) {
    // Create a notification for new messages from other users
    const notification = document.createElement('div');
    notification.className = 'message-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-sender">${msg.senderName}</div>
            <div class="notification-text">${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}</div>
        </div>
        <button class="view-message-btn">View</button>
    `;
    
    // Remove any existing notification for the same sender
    document.querySelectorAll('.message-notification').forEach(notif => {
        if (notif.querySelector('.notification-sender').textContent === msg.senderName) {
            notif.remove();
        }
    });
    
    document.body.appendChild(notification);
    
    // Play notification sound if available
    const notificationSound = new Audio('/assets/notification.mp3');
    notificationSound.volume = 0.5;
    notificationSound.play().catch(err => console.log('Notification sound not available'));
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
    
    // Handle click to view the message
    notification.querySelector('.view-message-btn').addEventListener('click', () => {
        // Find the chat item for this sender or create a new one
        let chatItem = document.querySelector(`#chat-list li[data-recipient-id="${msg.senderId}"]`);
        if (chatItem) {
            chatItem.click();
        } else {
            startChat(msg.senderId, msg.senderName);
        }
        notification.remove();
    });
}

function displayMessage(msg, isOwnMessage) {
    const chatMessages = document.getElementById("chat-messages");
    const messageElement = document.createElement("div");
    const messageId = msg.id || 'msg-' + Date.now();
    
    // Set id for the message element
    messageElement.id = messageId;
    
    // Differentiate between own message and message from others
    messageElement.classList.add("message-container", isOwnMessage ? "own-message" : "other-message");
    if (msg.pending) {
        messageElement.classList.add("pending");
    }
    
    // Format timestamp
    const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create message content
    let messageContent = `
        <div class="message-content">
            ${!isOwnMessage ? `<div class="message-sender">${msg.senderName}</div>` : ''}
            ${msg.quoted ? `
                <div class="quoted-message">
                    <i class="fas fa-reply"></i>
                    <span>${msg.quoted.text}</span>
                </div>
            ` : ''}
            <div class="message-text">${msg.text}</div>
            <div class="message-footer">
                <span class="message-time">${timeString}</span>
                ${isOwnMessage ? `
                    <span class="message-status">
                        ${msg.pending ? '<i class="fas fa-clock"></i>' : '<i class="fas fa-check"></i>'}
                    </span>
                ` : ''}
            </div>
        </div>
    `;
    
    // Add controls for non-own messages
    if (!isOwnMessage) {
        messageContent += `
            <div class="message-actions">
                <button class="reply-btn" title="Reply to this message"><i class="fas fa-reply"></i></button>
            </div>
        `;
    }
    
    messageElement.innerHTML = messageContent;
    
    // Add event listener for reply button
    if (!isOwnMessage) {
        const replyBtn = messageElement.querySelector('.reply-btn');
        replyBtn.addEventListener('click', () => quoteMessage(messageId, msg.text));
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function quoteMessage(msgId, messageText) {
    quotedMessage = { id: msgId, text: messageText };

    const quoteContainer = document.getElementById('quoted-message-container');
    const quotedText = document.getElementById('quoted-text');

    quotedText.textContent = messageText;
    quoteContainer.style.display = 'block';
    
    // Focus the message input
    document.getElementById('message').focus();
}

// Cancel quoting
document.getElementById('cancel-quote').addEventListener('click', () => {
    quotedMessage = null;
    document.getElementById('quoted-message-container').style.display = 'none';
    document.getElementById('message').focus();
});

// Detect if we're on mobile and adjust the UI accordingly
function checkMobile() {
    if (isMobile()) {
        document.body.classList.add('mobile');
        
        // If no chat is active, show the sidebar
        if (!currentRecipientId) {
            sidebar.classList.add('active');
        }
    } else {
        document.body.classList.remove('mobile');
        sidebar.classList.remove('active');
    }
}

// Check mobile status on load and resize
window.addEventListener('load', checkMobile);
window.addEventListener('resize', checkMobile);

// Add event listener for the welcome button
document.getElementById('welcome-new-chat-btn')?.addEventListener('click', () => {
    document.getElementById('new-chat-btn').click();
});

// AI Chat Integration
const chatFrame = document.getElementById("ai-chat-frame");
const chatLauncher = document.getElementById("ai-chat-launcher");

chatLauncher.addEventListener("click", () => {
    const isVisible = chatFrame.style.display === "block";
    chatFrame.style.display = isVisible ? "none" : "block";
    chatFrame.classList.add('fade-in');
    // If opening the chat, send a message to the iframe
    if (!isVisible) {
        chatFrame.contentWindow.postMessage({ action: 'openChat' }, '*');
    }
});

document.getElementById("export-chat").addEventListener("click", function (event) {
  console.log(exportChat)
  let chatText = "";
  exportChat.forEach(msg => {
    chatText += msg.senderName +": "+ msg.text+ "\n";
  });
  console.log(chatText)
  const blob = new Blob([chatText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "DMchats.txt";
  a.click();
  URL.revokeObjectURL(url);
})


// Listen for messages from the chatbot iframe
window.addEventListener('message', (event) => {
    if (event.data.action === 'closeChat') {
        chatFrame.style.display = "none";
    }
});