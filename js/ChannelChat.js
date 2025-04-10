// Socket connection for real-time messaging
const socket = io('ws://localhost:3000');
        
// Get team name from URL parameters
const params = new URLSearchParams(window.location.search);
const teamName = params.get("team");
 
// Initial variables
let channelClicked = "";
let currentUser = "";
let currentUserRole = "";
let quotedMessage = null;
let isLoading = true;
let exportChat={};
// Add loading styles
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .loading-channels {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 15px 20px;
            color: rgba(255, 255, 255, 0.7);
            font-style: italic;
        }

        .loading-spinner {
            width: 18px;
            height: 18px;
            border: 3px solid rgba(52, 152, 219, 0.3);
            border-radius: 50%;
            border-top-color: var(--primary-color);
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .welcome-message {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            padding: 20px;
            color: #888;
            animation: fadeIn 1s ease;
        }

        .welcome-icon {
            font-size: 48px;
            margin-bottom: 20px;
            animation: wave 2s infinite;
        }

        @keyframes wave {
            0%, 100% { transform: rotate(0); }
            25% { transform: rotate(-10deg); }
            75% { transform: rotate(10deg); }
        }

        .welcome-message h3 {
            margin-bottom: 10px;
            color: #555;
        }

        .welcome-message p {
            margin-bottom: 20px;
        }

        .input-disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    </style>
`);

// Fetch user information
fetch('/user-info')
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        currentUser = data.name;
        currentUserRole = data.role;
        console.log(`Logged in as: ${currentUser} (${currentUserRole})`);
    })
    .catch(() => window.location.href = '/Login-Form.html');

// Set the team name in the header
document.getElementById("chat-header").textContent = teamName || "Team Chat";

// Get origin for secure messaging
const TRUSTED_ORIGIN = window.location.origin;

// Main initialization function to reduce nesting
async function initializeChannels() {
    try {
        // Get team ID
        const teamIdResponse = await fetch('/get-team-id-from-name', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamName })
        });
        
        const teamIdData = await teamIdResponse.json();
        if (!teamIdData.teamId) throw new Error("Team ID not found");
        
        const teamId = teamIdData.teamId;
        console.log("Fetched Team ID:", teamId);
        
        // Get channels for team
        const channelsResponse = await fetch('/get-channels', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId })
        });
        
        const channelsData = await channelsResponse.json();
        await populateChannelList(channelsData, teamId);
    } catch (error) {
        console.error("Fetch Error:", error);
        displayChannelError(error);
    }
}

// Populate channel list with user's channels
async function populateChannelList(data, teamId) {
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = "";
    isLoading = false;

    // Populate the channels list
    if (data.channels && data.channels.length > 0) {
        try {
            // Get user's channels
            const userChannelsResponse = await fetch('/get-user-channels', {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
            
            if (!userChannelsResponse.ok) {
                throw new Error("Failed to fetch user channels");
            }
            
            const userChannels = await userChannelsResponse.json();
            
            // Extract channel names
            const channelNames = userChannels.flatMap(team => 
                team.channels.map(channel => channel.channelName)
            );
            
            console.log("User Channel Names:", channelNames);
            console.log("Team Channel Names:", data.channels);
            
            const filteredChannels = data.channels.filter(channel => 
                channelNames.includes(channel)
            );
            
            // Create channel list items
            filteredChannels.forEach(channel => {
                const listItem = createChannelListItem(channel);
                chatList.appendChild(listItem);
            });
            
            // Setup message sending functionality
            setupMessageHandlers();
            
            // Auto-select first channel
            if (filteredChannels.length > 0) {
                const firstChannel = document.querySelector("#chat-list li");
                firstChannel.click();
            }
        } catch (error) {
            console.error("Error loading user channels:", error);
            displayChannelError(error);
        }
    } else {
        displayNoChannelsMessage(chatList);
    }
}

// Create a channel list item with event listeners
function createChannelListItem(channel) {
    const listItem = document.createElement("li");
    listItem.textContent = channel;
    listItem.classList.add("channel-item");

    // Add click event to load channel messages
    listItem.addEventListener("click", () => {
        // Update active channel visual indicator
        document.querySelectorAll("#chat-list li").forEach(item => {
            item.classList.remove("active");
        });
        listItem.classList.add("active");
        
        // Show loading indicator in messages area
        document.getElementById("chat-messages").innerHTML = `
            <div class="loading-message">
                <div class="loading-spinner"></div>
                <span>Loading messages...</span>
            </div>
        `;
        
        // Leave previous channel room if exists
        if (channelClicked) {
            socket.emit("leave-channel", {
                teamName: teamName,
                channelName: channelClicked
            });
        }
        
        channelClicked = channel;
        document.getElementById("chat-header").textContent = `${channel}`;
        
        // Join new channel room
        socket.emit("join-channel", {
            teamName: teamName,
            channelName: channel
        });
        
        // Enable input controls
        enableInputControls(channel);
        
        getChannelMessages(teamName, channel);
    });

    return listItem;
}

// Enable message input controls
function enableInputControls(channel) {
    const messageInput = document.getElementById("message");
    const emojiBtn = document.getElementById("emoji-btn");
    const sendBtn = document.getElementById("send");
    
    messageInput.disabled = false;
    emojiBtn.disabled = false;
    sendBtn.disabled = false;
    
    messageInput.placeholder = `Message #${channel}`;
}

// Setup message sending event handlers
function setupMessageHandlers() {
    document.getElementById("send").addEventListener("click", function() {
        sendMessage(teamName, channelClicked);
    });

    document.getElementById("message").addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
            sendMessage(teamName, channelClicked);
        }
    });
}

// Display empty channels message
function displayNoChannelsMessage(chatList) {
    const noChannels = document.createElement("li");
    noChannels.textContent = "No channels available";
    noChannels.style.color = "#999";
    noChannels.style.fontStyle = "italic";
    noChannels.style.padding = "15px 20px";
    chatList.appendChild(noChannels);
}

// Display channel error message
function displayChannelError(error) {
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = `
        <li class="error-message">
            <span>Error loading channels</span>
            <button id="retry-button">Retry</button>
        </li>
    `;
    
    document.getElementById("retry-button").addEventListener("click", () => {
        window.location.reload();
    });
}

// Fetch channel messages
function getChannelMessages(teamName, channelName) {
    return fetch('/api/get-channel-messages', {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamName, channelName })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(messages => {
        const chatContainer = document.getElementById("chat-messages");
        chatContainer.innerHTML = "";

        if (!messages || messages.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "empty-channel";
            emptyState.textContent = "No messages in this channel yet. Start the conversation!";
            chatContainer.appendChild(emptyState);
            return;
        }

        // Process each message
        exportChat = messages;
        messages.forEach(msg => {
            displayMessage(msg, msg.sender === currentUser);
        });

        // Scroll to bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    })
    .catch(error => {
        console.error("Error fetching messages:", error);
        const chatContainer = document.getElementById("chat-messages");
        chatContainer.innerHTML = `
            <div class="error-message">
                <div><i class="fas fa-exclamation-circle"></i></div>
                <p>Error loading messages: ${error.message}</p>
                <button id="retry-messages">Retry</button>
            </div>
        `;
        
        document.getElementById("retry-messages").addEventListener("click", () => {
            getChannelMessages(teamName, channelName);
        });
    });
}

// Remove a message from the chat (admin only)
function removeMessage(messageId, messageDiv) {
    // Add pending state to the message
    messageDiv.classList.add("removing");
    
    fetch('/remove-message', {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            messageDiv.querySelector(".message-text").textContent = "Removed by Admin";
            // Remove buttons once message is deleted
            const buttons = messageDiv.querySelectorAll("button");
            buttons.forEach(btn => btn.remove());
            // Add visual indicator for removed message
            messageDiv.style.opacity = "0.6";
            messageDiv.classList.remove("removing");
        } else {
            console.error("Error removing message:", data.error);
            messageDiv.classList.remove("removing");
        }
    })
    .catch(error => {
        console.error("Fetch Error:", error);
        messageDiv.classList.remove("removing");
    });
}

// Listen for new channel messages
socket.on("ChannelMessages", (msg) => { 
    if (msg.channelName === channelClicked) {
        displayMessage(msg, msg.sender === currentUser);
    }
});

// Display a message in the chat window
function displayMessage(msg, isOwnMessage) {
    const chatMessages = document.getElementById("chat-messages");
    const messageElement = document.createElement("div");

    // Apply message class
    
    messageElement.classList.add("message", isOwnMessage ? "my-message" : "other-message");

    // Add username styling (only for other people's messages)
    if (!isOwnMessage) {
        const usernameElement = document.createElement("div");
        usernameElement.classList.add("message-username");
        usernameElement.textContent = msg.sender;
        if (msg.text != "Removed by Admin") {
            messageElement.appendChild(usernameElement);
        }
    }

    // Add quoted message if it exists
    if (msg.quoted) {
        const quotedElement = document.createElement("div");
        quotedElement.classList.add("quoted-message");
        quotedElement.textContent = `Replying to: "${msg.quoted}"`;
        if (msg.text != "Removed by Admin") {
            messageElement.appendChild(quotedElement);
        }
    }

    // Add message text
    const textElement = document.createElement("div");
    textElement.classList.add("message-text");
    textElement.textContent = msg.text;
    
    // Special styling for removed messages
    if (msg.text === "Removed by Admin") {
        textElement.style.fontStyle = "italic";
        textElement.style.opacity = "0.7";
        messageElement.style.opacity = "0.6";
    }
    
    messageElement.appendChild(textElement);

    // Add remove button for admin
    if (currentUserRole === "admin" && msg.text !== "Removed by Admin") {
        const removeButton = document.createElement("button");
        removeButton.innerHTML = '<i class="fas fa-trash"></i>';
        removeButton.title = "Delete message";
        removeButton.classList.add("remove-btn");
        removeButton.addEventListener("click", () => {
            removeMessage(msg.id, messageElement);
        });
        messageElement.appendChild(removeButton);
    }

    // Add reply button
    if (msg.id && msg.text != "Removed by Admin" && !isOwnMessage) {
        const quoteButton = document.createElement("button");
        quoteButton.innerHTML = '<i class="fas fa-reply"></i>';
        quoteButton.title = "Reply to message";
        quoteButton.classList.add("quote-btn");
        quoteButton.onclick = () => quoteMessage(msg.id, msg.text);
        messageElement.appendChild(quoteButton);
    }

    // Append the message to the chat window
    chatMessages.appendChild(messageElement);
}

// Send message to the server
function sendMessage(teamName, channelName) {
    const messageInput = document.getElementById("message");
    const messageText = messageInput.value.trim();
 
    if (messageText === "" || !channelName) {
        return;
    }

    // Temporarily disable input to prevent double-sending
    messageInput.disabled = true;
    
    const messageData = {
        teamName: teamName,
        channelName: channelName,
        sender: currentUser,
        text: messageText,
        quoted: quotedMessage
    }; 
    
    // Send message via socket.io
    socket.emit("ChannelMessages", messageData);        
    
    // Clear input and quoted message
    messageInput.value = "";
    messageInput.disabled = false;
    messageInput.focus();
    
    if (quotedMessage) {
        quotedMessage = null;
        document.getElementById('quoted-message-container').style.display = 'none';
    }
}

// Handle emoji picker
document.getElementById("emoji-btn").addEventListener("click", function(event) {
    event.stopPropagation(); 
    
    if (this.disabled) return;
    
    const pickerContainer = document.getElementById("emoji-picker-container");

    if (pickerContainer.style.display === "none" || pickerContainer.innerHTML === "") {
        pickerContainer.style.display = "block";
        pickerContainer.innerHTML = "";

        const picker = new EmojiMart.Picker({
            set: 'apple',
            onEmojiSelect: (emoji) => {
                const messageInput = document.getElementById("message");
                messageInput.value += emoji.native || emoji.colons || emoji.id;
                pickerContainer.style.display = "none";
                messageInput.focus();
            }
        });

        pickerContainer.appendChild(picker);
    } else {
        pickerContainer.style.display = "none";
    }
});

// Close emoji picker when clicking outside
document.addEventListener("click", function(event) {
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

// Quote message functionality
function quoteMessage(msgId, messageText) {
    quotedMessage = messageText;
    const quoteContainer = document.getElementById('quoted-message-container');
    const quotedText = document.getElementById('quoted-text');
    quotedText.textContent = `Replying to: "${messageText}"`;
    quoteContainer.style.display = 'block';
    
    // Focus on the message input after quoting
    document.getElementById('message').focus();
}
 
// Cancel quote button
document.getElementById('cancel-quote').addEventListener('click', () => {
    quotedMessage = null;
    document.getElementById('quoted-message-container').style.display = 'none';
});

// AI Chatbot Integration
const chatFrame = document.getElementById("ai-chat-frame");
const chatLauncher = document.getElementById("ai-chat-launcher");

chatLauncher.addEventListener("click", () => {
    const isVisible = chatFrame.style.display === "block";
    chatFrame.style.display = isVisible ? "none" : "block";
    chatFrame.classList.add('fade-in');
    // If opening the chat, send a message to the iframe
    if (!isVisible) {
        chatFrame.contentWindow.postMessage({ action: 'openChat' }, TRUSTED_ORIGIN);
    }
});

// Listen for messages from the chatbot iframe with origin validation
window.addEventListener('message', (event) => {
    // Verify the origin of the message for security
    if (event.origin !== TRUSTED_ORIGIN) {
        console.error('Message received from untrusted origin:', event.origin);
        return;
    }
    
    if (event.data.action === 'closeChat') {
        chatFrame.style.display = "none";
    }
});

document.getElementById("export-chat").addEventListener("click", function (event) {
    console.log(exportChat)
    let chatText = "";
    exportChat.forEach(msg => {
        chatText += msg.sender +": "+ msg.text+ "\n";
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

// Listen for channel messages
socket.on("ChannelMessages", (message) => {
    if (message.teamName === teamName && message.channelName === channelClicked) {
        displayMessage(message, message.sender === currentUser);
    }
});

// Listen for errors
socket.on("error", (error) => {
    console.error("Socket error:", error);
    // Show error to user
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = error.message || 'An error occurred while sending the message';
    document.getElementById('chat-messages').appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
});

// Leave the channel room when leaving
window.addEventListener("beforeunload", () => {
    socket.emit("leave-channel", {
        teamName: teamName,
        channelName: channelClicked
    });
});

// Add debug logging for socket events
socket.on("connect", () => {
    console.log("Socket connected, current user:", currentUser);
});

socket.on("disconnect", () => {
    console.log("Socket disconnected");
});

// Start the initialization
initializeChannels();