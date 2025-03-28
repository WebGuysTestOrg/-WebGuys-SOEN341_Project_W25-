// Socket.io connection
let socket = io();
let loggedInUserName = null;
let quotedMessage = null;

document.addEventListener('DOMContentLoaded', () => {
    // Get logged in username from the session
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            loggedInUserName = data.name;
        })
        .catch(error => {
            window.location.href = '/login_form.html';
        });

    // Chat elements
    const chatContainer = document.getElementById('chat-container');
    const closeChat = document.getElementById('close-chat');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const emojiButton = document.getElementById('emoji-button');
    const emojiPickerContainer = document.getElementById('emoji-picker-container');
    const chatMessages = document.getElementById('chat-messages');

    if (!chatContainer || !closeChat || !messageForm || !messageInput || !chatMessages) {
        return;
    }

    // Toggle chat visibility
    document.getElementById('chat-toggle').addEventListener('click', () => {
        chatContainer.classList.add('active');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    closeChat.addEventListener('click', () => {
        chatContainer.classList.remove('active');
    });

    // Initialize emoji picker
    let picker = null;
    emojiButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!picker) {
            picker = new EmojiMart.Picker({
                onEmojiSelect: (emoji) => {
                    messageInput.value += emoji.native;
                    messageInput.focus();
                    emojiPickerContainer.style.display = 'none';
                },
                showPreview: false,
                showSkinTones: false,
                emojiSize: 20
            });
            emojiPickerContainer.appendChild(picker);
        }
        
        const isVisible = emojiPickerContainer.style.display === 'block';
        emojiPickerContainer.style.display = isVisible ? 'none' : 'block';
    });

    // Hide emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiButton.contains(e.target) && !emojiPickerContainer.contains(e.target)) {
            emojiPickerContainer.style.display = 'none';
        }
    });

    // Send message
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        
        if (text) {
            const messageData = {
                text: text,
                user: loggedInUserName,
                timestamp: new Date().toISOString(),
                quotedMessage: quotedMessage
            };
            
            // Display message immediately for sender
            displayMessage(messageData);
            
            socket.emit('chat message', messageData);
            messageInput.value = '';
            
            // Clear quote preview
            const quotePreview = document.getElementById('quote-preview');
            if (quotePreview) {
                quotePreview.remove();
            }
            quotedMessage = null;
        }
    });

    // Handle received messages
    socket.on('chat message', (msg) => {
        // Only display messages from others (sender's message is already displayed)
        if (msg.user !== loggedInUserName) {
            displayMessage(msg);
        }
    });
});

// Function to display messages
function displayMessage(msg) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = msg.user === loggedInUserName ? 'my-message' : 'other-message';
    
    let content = '<div class="message-content">';
    
    // Add sender name for other users' messages
    if (msg.user !== loggedInUserName) {
        content += `<div class="message-sender">${msg.user}</div>`;
    }
    
    // Add quoted message if exists
    if (msg.quotedMessage) {
        content += `
            <div class="quoted-message">
                <span class="quoted-sender">${msg.quotedMessage.user}</span>
                <span class="quoted-text">${msg.quotedMessage.text}</span>
            </div>
        `;
    }
    
    // Add message text and time
    content += `
        <div class="message-text">${msg.text}</div>
        <div class="message-time">${formatTime(msg.timestamp)}</div>
    </div>
    `;
    
    // Add reply button
    content += `
        <button class="reply-button" onclick="replyToMessage(this)">
            <i class="fas fa-reply"></i>
        </button>
    `;
    
    messageDiv.innerHTML = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Reply to message
function replyToMessage(button) {
    const messageDiv = button.parentElement;
    const messageText = messageDiv.querySelector('.message-text').textContent;
    const messageSender = messageDiv.querySelector('.message-sender')?.textContent || loggedInUserName;
    
    quotedMessage = {
        text: messageText,
        user: messageSender
    };
    
    // Create quote preview
    let quotePreview = document.getElementById('quote-preview');
    if (!quotePreview) {
        quotePreview = document.createElement('div');
        quotePreview.id = 'quote-preview';
        const messageForm = document.getElementById('message-form');
        messageForm.insertBefore(quotePreview, messageForm.firstChild);
    }
    
    quotePreview.innerHTML = `
        <div class="quote-content">
            <div class="quote-sender">Replying to ${messageSender}</div>
            <div class="quote-text">${messageText}</div>
        </div>
        <button class="cancel-quote" onclick="cancelReply()">×</button>
    `;
    
    document.getElementById('message-input').focus();
}

// Cancel reply
function cancelReply() {
    quotedMessage = null;
    const quotePreview = document.getElementById('quote-preview');
    if (quotePreview) {
        quotePreview.remove();
    }
}

function initializeSocket(userData) {
    socket.auth = {
        userId: userData.id,
        userName: userData.name
    };

    socket.on('connect', () => {
        console.log('Socket connected with auth:', socket.auth);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
            socket.connect();
        }
    });

    // Initialize forms and other functionality
    initializeForms(socket);
}

function initializeForms(socket) {
    // Create Team Form
    document.getElementById('createTeamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const teamName = document.getElementById('teamName').value;
        
        try {
            const response = await fetch('/create-team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ teamName })
            });
            
            const data = await response.json();
            
            if (data.error) {
                alert(data.error);
            } else {
                alert('Team created successfully!');
                document.getElementById('createTeamForm').reset();
            }
        } catch (error) {
            alert('Error creating team');
        }
    });
} 