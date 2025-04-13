let userTeams = {};
const socket = io('ws://localhost:3000', {
    withCredentials: true
});
let globalChatOpen = false;

// Initialize user data and socket connection
let currentUserId = null;
let currentUserName = null;

async function fetchUserTeams() {
    try {
        const response = await fetch('/api/teams/user-teams');
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}: Failed to fetch teams`);
        }
        
        const teams = await response.json();
        
        if (!teams || !Array.isArray(teams)) {
            console.warn("Teams data is not in expected format:", teams);
            showToast("Teams data is not in the expected format.", "error");
            return;
        }
        renderTeams(teams);
    } catch (err) {
        console.error("Error fetching teams:", err);
        showToast("Failed to load teams. this is the problemm.", "error");
    }
}

function renderTeams(teams) {
    userTeams = {}; 
    const teamsContainer = document.getElementById("teams-container");
    teamsContainer.innerHTML = "";

    if (!teams || teams.length === 0) {
        teamsContainer.innerHTML = '<div class="no-teams-message"><p>You are not a member of any teams yet.</p></div>';
        return;
    }

    teams.forEach(team => {
        userTeams[team.teamId] = team;
        const teamElement = createTeamCard(team);
        teamsContainer.appendChild(teamElement);
    });
}

function createTeamCard(team) {
    const teamElement = document.createElement("div");
    teamElement.classList.add("team-card");

    const teamHeader = createTeamHeader(team);
    const createChannelForm = createChannelFormElement(team);
    const channelsSection = createChannelsSection(team);
    const teamsButton = createTeamButton(team);

    teamElement.appendChild(teamHeader);
    teamElement.appendChild(createChannelForm);
    teamElement.appendChild(channelsSection);
    teamElement.appendChild(teamsButton);

    return teamElement;
}

function createTeamHeader(team) {
    const header = document.createElement("div");
    header.classList.add("team-header");
    header.innerHTML = `
        <h3>(${team.teamId}) ${team.teamName}</h3>
        <p><strong>Created by:</strong> ${team.creatorName || "Unknown"}</p>
        <div class="team-members">
            <strong>Members:</strong> ${team.members.length ? team.members.join(", ") : "No members"}
        </div>
    `;
    return header;
}

function createChannelFormElement(team) {
    const formWrapper = document.createElement("div");
    formWrapper.classList.add("create-channel-form");
    formWrapper.innerHTML = `
        <div class="channel-form-header">
            <button class="btn show-channel-form"><i class="fas fa-plus"></i> Create Channel</button>
        </div>
        <form class="channel-form" style="display: none;">
            <input type="text" class="channel-name-input" placeholder="Enter Channel Name" required>
            <div class="channel-helper">Channel name can contain letters, numbers, hyphens and underscores</div>
            <button type="submit" class="btn create-channel-btn"><i class="fas fa-plus"></i> Create</button>
        </form>
    `;

    handleChannelFormEvents(formWrapper, team);
    return formWrapper;
}

function handleChannelFormEvents(formWrapper, team) {
    const showFormBtn = formWrapper.querySelector('.show-channel-form');
    const channelForm = formWrapper.querySelector('.channel-form');
    const channelNameInput = formWrapper.querySelector('.channel-name-input');

    showFormBtn.addEventListener('click', () => {
        channelForm.style.display = channelForm.style.display === 'none' ? 'block' : 'none';
    });

    channelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const channelName = channelNameInput.value.trim();

        if (!channelName) return showToast("Channel name is required", "error");

        const validName = /^[a-zA-Z0-9_-]+$/;
        if (!validName.test(channelName)) {
            return showToast("Channel name can only contain letters, numbers, hyphens and underscores", "error");
        }

        await createChannel(team.teamId, channelName);
        channelForm.style.display = 'none';
        channelNameInput.value = '';
        fetchUserTeams();
    });
}

async function createChannel(teamId, channelName) {
    try {
        const response = await fetch('/api/channels/create-channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, channelName })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create channel');
        
        showToast("Channel created successfully!", "success");
    } catch (err) {
        console.error("Error creating channel:", err);
        showToast(err.message || "Failed to create channel", "error");
    }
}

function createChannelsSection(team) {
    const section = document.createElement("div");
    section.classList.add("channels-section");

    if (team.channels && Object.keys(team.channels).length) {
        Object.values(team.channels).forEach(channel => {
            const channelElement = createChannelElement(channel, team);
            section.appendChild(channelElement);
        });
    } else {
        const noChannelsMsg = document.createElement("p");
        noChannelsMsg.textContent = "No channels yet";
        noChannelsMsg.style.fontStyle = "italic";
        section.appendChild(noChannelsMsg);
    }

    return section;
}

function createChannelElement(channel, team) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("channel-item");

    const content = document.createElement("div");
    content.classList.add("channel-content");
    content.innerHTML = `
        <div class="channel-header">
            <h4>📢 ${channel.channelName}</h4>
            <button class="assign-user-btn" title="Assign User"><i class="fas fa-user-plus"></i></button>
        </div>
        <p class="channel-members"><strong>Members:</strong> ${channel.members.length ? channel.members.join(", ") : "No members"}</p>
    `;

    const assignForm = createAssignForm(team, channel, content);

    wrapper.appendChild(content);
    wrapper.appendChild(assignForm);
    return wrapper;
}

function createAssignForm(team, channel, content) {
    const form = document.createElement("div");
    form.classList.add("channel-assign-form");
    form.style.display = "none";

    const availableMembers = team.members.filter(member => !channel.members.includes(member));

    form.innerHTML = `
        <div class="assign-form-content">
            <select class="team-members-select">
                <option value="">Select Team Member</option>
                ${availableMembers.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <button class="btn assign-btn" disabled><i class="fas fa-plus"></i> Add</button>
            <button class="btn cancel-btn"><i class="fas fa-times"></i></button>
        </div>
    `;

    handleAssignFormEvents(form, team, channel, content);
    return form;
}

function handleAssignFormEvents(form, team, channel, content) {
    const assignUserBtn = content.querySelector('.assign-user-btn');
    const cancelBtn = form.querySelector('.cancel-btn');
    const memberSelect = form.querySelector('.team-members-select');
    const assignBtn = form.querySelector('.assign-btn');

    assignUserBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.channel-assign-form').forEach(f => {
            if (f !== form) f.style.display = "none";
        });
        form.style.display = form.style.display === "none" ? "block" : "none";
    });

    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        form.style.display = "none";
    });

    memberSelect.addEventListener('change', () => {
        assignBtn.disabled = !memberSelect.value;
    });

    assignBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const userName = memberSelect.value;
        if (!userName) return showToast("Please select a team member", "error");

        await assignUserToChannel(team.teamId, channel.channelName, userName, form, content, memberSelect, assignBtn, assignUserBtn);
    });
}

async function assignUserToChannel(teamId, channelName, userName, form, content, memberSelect, assignBtn, assignUserBtn) {
    assignBtn.disabled = true;
    assignBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    try {
        const response = await fetch('/assign-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, channelName, userName })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to assign user');

        showToast(`Successfully assigned ${userName} to channel ${channelName}`, "success");

        const membersP = content.querySelector('.channel-members');
        membersP.innerHTML = `<strong>Members:</strong> ${data.updatedMembers.join(', ')}`;

        form.style.display = "none";
        memberSelect.value = '';
        assignBtn.disabled = true;

        Array.from(memberSelect.options).forEach(opt => {
            if (opt.value === userName) opt.remove();
        });

        if (memberSelect.options.length <= 1) {
            assignUserBtn.disabled = true;
            assignUserBtn.title = 'All team members are already in this channel';
        }

    } catch (err) {
        console.error("Error assigning user:", err);
        showToast(err.message || "Failed to assign user", "error");
    } finally {
        assignBtn.disabled = false;
        assignBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
    }
}

function createTeamButton(team) {
    const button = document.createElement("button");
    button.textContent = "Open Team Chat";
    button.classList.add("teamsButton");
    button.addEventListener("click", () => {
        window.location.href = `channel_chat.html?team=${encodeURIComponent(team.teamName)}`;
    });
    return button;
}


// Initialize global chat
function initializeGlobalChat() {
    const chatToggle = document.getElementById('chat-toggle');
    const chatContainer = document.getElementById('chat-container');
    const closeChat = document.getElementById('close-chat');
    const messageInput = document.getElementById('message');
    const sendButton = document.getElementById('send');
    const chatMessages = document.getElementById('chat-messages');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPickerContainer = document.getElementById('emoji-picker-container');

    // Toggle chat visibility
    chatToggle.addEventListener('click', () => {
        globalChatOpen = !globalChatOpen;
        chatContainer.style.right = globalChatOpen ? '0' : '-700px';
        if (globalChatOpen) {
            messageInput.focus();
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    closeChat.addEventListener('click', () => {
        globalChatOpen = false;
        chatContainer.style.right = '-700px';
    });

    // Emoji picker
    let picker = null;
    emojiBtn.addEventListener('click', () => {
        if (!picker) {
            picker = new EmojiMart.Picker({
                onEmojiSelect: (emoji) => {
                    messageInput.value += emoji.native;
                    messageInput.focus();
                }
            });
            emojiPickerContainer.innerHTML = '';
            emojiPickerContainer.appendChild(picker);
        }
        
        // Toggle the emoji picker
        emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
    });

    // Send message
    function sendMessage() {
        const messageInput = document.getElementById('message');
        const message = messageInput.value.trim();
        if (message) {
            // Get quote data if it exists
            let quoteData = null;
            try {
                quoteData = messageInput.dataset.quoteData ? JSON.parse(messageInput.dataset.quoteData) : null;
            } catch (e) {
                console.error("Error parsing quote data:", e);
            }
            
            const messageData = {
                text: message,
                timestamp: new Date(),
                sender_id: currentUserId,
                sender_name: currentUserName,
                quoted_text: quoteData ? quoteData.text : null,
                quoted_sender: quoteData ? quoteData.sender_name : null
            };
            
            socket.emit('global-message', messageData);
            
            // Clear input and quote data
            messageInput.value = '';
            messageInput.dataset.quoteData = '';
            messageInput.classList.remove('has-quote');
            
            const chatInput = document.getElementById('chat-input');
            chatInput.classList.remove('has-quote');
            const quoteContainer = chatInput.querySelector('.quote-container');
            quoteContainer.innerHTML = '';
            
            messageInput.focus();
        }
    }

    // Fix message input structure for proper layout
    function setupChatInput() {
        const chatInput = document.getElementById('chat-input');
        const messageInputWrapper = chatInput.querySelector('.message-input-wrapper');
        
        // Clear current structure
        messageInputWrapper.innerHTML = `
            <div class="quote-container"></div>
            <div class="input-container">
                <input type="text" id="message" placeholder="Type a message...">
                <div class="input-buttons">
                    <button id="emoji-btn" title="Add Emoji">😊</button>
                    <button id="send" title="Send Message">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Re-attach event listeners
        const messageInput = document.getElementById('message');
        const sendButton = document.getElementById('send');
        const emojiBtn = document.getElementById('emoji-btn');
        
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        emojiBtn.addEventListener('click', () => {
            if (!picker) {
                picker = new EmojiMart.Picker({
                    onEmojiSelect: (emoji) => {
                        messageInput.value += emoji.native;
                        messageInput.focus();
                    }
                });
                emojiPickerContainer.innerHTML = '';
                emojiPickerContainer.appendChild(picker);
            }
            
            emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Call this function after initializing the chat
    setupChatInput();

    // Handle incoming messages
    socket.on('global-message', (message) => {
        appendMessage(message);
        if (!globalChatOpen) {
            showToast('New message in Global Chat', 'info');
        }
    });

    // Load chat history
    socket.on('global-chat-history', (messages) => {
        chatMessages.innerHTML = '';
        messages.forEach(appendMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    function appendMessage(message) {
        const messageDiv = document.createElement('div');
        const isMyMessage = message.sender_id === currentUserId;
        messageDiv.className = `message-container ${isMyMessage ? 'right' : 'left'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Handle both message formats from different sources
        const messageText = message.message || message.text;
        
        messageDiv.innerHTML = `
            <div class="message ${isMyMessage ? 'sent' : 'received'} ${message.quoted_text ? 'has-quote' : ''}">
                ${!isMyMessage ? `<div class="sender-name">${message.sender_name}</div>` : ''}
                <div class="message-content">
                    ${message.quoted_text ? `
                        <div class="quoted-message">
                            <div class="quoted-sender">Replying to ${message.quoted_sender}</div>
                            <div class="quoted-text">${message.quoted_text}</div>
                        </div>
                    ` : ''}
                    <div class="message-text">${messageText}</div>
                    <div class="message-time">${time}</div>
                    <button class="quote-btn" title="Reply to this message">
                        <i class="fas fa-reply"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add event listener for quote button
        const quoteBtn = messageDiv.querySelector('.quote-btn');
        if (quoteBtn) {
            quoteBtn.addEventListener('click', () => {
                const messageData = {
                    text: messageText,
                    sender_name: message.sender_name
                };
                
                const messageInput = document.getElementById('message');
                const chatInput = document.getElementById('chat-input');
                
                messageInput.dataset.quoteData = JSON.stringify(messageData);
                messageInput.classList.add('has-quote');
                chatInput.classList.add('has-quote');
                
                // Show quote preview
                const quoteContainer = chatInput.querySelector('.quote-container');
                quoteContainer.innerHTML = '';
                
                const quotePreview = document.createElement('div');
                quotePreview.className = 'quote-preview';
                quotePreview.innerHTML = `
                    <div class="quoted-content">
                        <div class="quoted-sender">Replying to ${messageData.sender_name}</div>
                        <div class="quoted-text">${messageData.text}</div>
                    </div>
                    <button class="remove-quote" title="Remove quote">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                quoteContainer.appendChild(quotePreview);
                
                // Add event listener to remove quote
                quotePreview.querySelector('.remove-quote').addEventListener('click', () => {
                    quotePreview.remove();
                    messageInput.dataset.quoteData = '';
                    messageInput.classList.remove('has-quote');
                    chatInput.classList.remove('has-quote');
                });
                
                messageInput.focus();
            });
        }
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Click outside emoji picker to close it
    document.addEventListener('click', (e) => {
        if (!emojiPickerContainer.contains(e.target) && e.target !== emojiBtn) {
            emojiPickerContainer.style.display = 'none';
        }
    });
}

// Function to fetch and display private channels (groups)
async function fetchPrivateChannels() {
    const container = document.getElementById("private-channels-container");
    showLoading(container);

    try {
        const response = await fetch("/api/groups/get-groups");
        const groups = await response.json();

        await handleGroupsResponse(groups, container);
    } catch (err) {
        console.error("Error fetching private channels:", err);
        showError(container, "Failed to load private channels. Please try again.");
    }
}

function showLoading(container) {
    container.innerHTML = `
        <div class="private-channels-loading">
            <i class="fas fa-spinner fa-spin"></i> Loading your private channels...
        </div>`;
}

function showError(container, message) {
    container.innerHTML = `
        <div class="no-private-channels" style="color: #e74c3c;">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>`;
}

async function handleGroupsResponse(groups, container) {
    container.innerHTML = "";

    if (!groups.length) {
        return renderNoPrivateChannels(container);
    }

    const privateChannels = [];

    await Promise.all(groups.map(group => fetchGroupMembers(group, privateChannels)));

    if (!privateChannels.length) {
        return renderNoPrivateChannels(container);
    }

    renderPrivateChannels(container, privateChannels);
}

async function fetchGroupMembers(group, privateChannels) {
    try {
        const response = await fetch(`/api/groups/group-members/${group.id}`);
        const members = await response.json();

        const isMember = members.some(member => member.id === currentUserId);

        if (isMember) {
            privateChannels.push({
                ...group,
                memberCount: members.length
            });
        }
    } catch (err) {
        console.error(`Error fetching members for group ${group.id}:`, err);
    }
}

function renderNoPrivateChannels(container) {
    container.innerHTML = `
        <div class="no-private-channels">
            <i class="fas fa-users-slash"></i>
            <p>You don't have any private channels yet</p>
        </div>`;
}

function renderPrivateChannels(container, privateChannels) {
    privateChannels.forEach(group => {
        const card = document.createElement("div");
        card.className = "private-channel-card";

        card.innerHTML = `
            <h3>${group.name}</h3>
            <p>${group.description || "No description available"}</p>
            <div class="members-count">
                <i class="fas fa-users"></i> ${group.memberCount} members
            </div>
            <div class="private-channel-actions">
                <a href="private_channels.html?id=${group.id}" class="btn">
                    <i class="fas fa-comment-dots"></i> Open Chat
                </a>
            </div>
        `;

        container.appendChild(card);
    });
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
    fetch('/api/auth/user-info')
        .then(response => response.json())
        .then(data => {
            document.getElementById('username').textContent = data.name;
            currentUserId = data.id;
            currentUserName = data.name;
            socket.userId = data.id;
            socket.userName = data.name;
            
            // Signal that the user is online after all data is loaded
            console.log("Emitting online status for user ID:", currentUserId);
            socket.emit("userOnline", currentUserId);
            
            // Initialize components
            fetchUserTeams();
            fetchPrivateChannels();
            initializeGlobalChat();
            initializeUserStatus();
        })
        .catch(() => window.location.href = '/Login-Form.html');
});

// Add this function to update a specific channel's members
function updateChannelMembers(teamId, channelName, newMember) {
    const teamCard = document.querySelector(`.team-card h3:contains("(${teamId})")`).closest('.team-card');
    const channelItem = teamCard.querySelector(`.channel-item h4:contains("${channelName}")`).closest('.channel-item');
    const membersP = channelItem.querySelector('.channel-members');
    
    let currentMembers = membersP.textContent.replace('Members:', '').trim();
    currentMembers = currentMembers === 'No members' ? [] : currentMembers.split(', ');
    
    if (!currentMembers.includes(newMember)) {
        currentMembers.push(newMember);
        membersP.innerHTML = `<strong>Members:</strong> ${currentMembers.join(', ')}`;
        
        // Update the available members in the dropdown
        const memberSelect = channelItem.querySelector('.team-members-select');
        if (memberSelect) {
            Array.from(memberSelect.options).forEach(option => {
                if (option.value === newMember) {
                    option.remove();
                }
            });
            
            // If no more members to add, disable the assign button
            const assignUserBtn = channelItem.querySelector('.assign-user-btn');
            if (memberSelect.options.length <= 1) { // Only the default option left
                assignUserBtn.disabled = true;
                assignUserBtn.title = 'All team members are already in this channel';
            }
        }
    }
}

// Enhanced toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add icon based on type
    let icon = '';
    switch(type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i> ';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i> ';
            break;
        default:
            icon = '<i class="fas fa-info-circle"></i> ';
    }
    
    toast.innerHTML = icon + message;
    
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    
    // Add slide-in animation
    toast.style.animation = 'slideIn 0.5s ease-out';
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.5s ease-in';
        setTimeout(() => {
            toast.remove();
        }, 450);
    }, 3000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .toast {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        background: white;
        color: #333;
        font-weight: 500;
    }
    
    .toast.success {
        background: #e8f5e9;
        border-left: 4px solid #4caf50;
    }
    
    .toast.error {
        background: #fbe9e7;
        border-left: 4px solid #f44336;
    }
    
    .toast i {
        font-size: 1.2em;
    }
    
    .toast.success i {
        color: #4caf50;
    }
    
    .toast.error i {
        color: #f44336;
    }
`;
document.head.appendChild(style);

// Add new styles for the navigation buttons
const navStyle = document.createElement('style');
navStyle.textContent = `
    .quick-actions {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-start;
        position: relative;
    }

    .settings-btn {
        margin-left: auto;
    }

    .logout-btn {
        background: #ff4444;
        transition: all 0.3s ease;
    }

    .logout-btn:hover {
        background: #ff6666;
        color: var(--text-light);
    }

    @media (max-width: 768px) {
        .quick-actions {
            flex-direction: column;
            align-items: stretch;
        }

        .settings-btn {
            margin-left: 0;
        }
    }
`;
document.head.appendChild(navStyle);

// Add styles for the new chat layout
const chatStyle = document.createElement('style');
chatStyle.textContent = `
    #chat-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #1a1a1a;
    }

    #chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        margin-bottom: 80px; /* Space for input container */
    }

    .message-input-container {
        position: fixed;
        bottom: 0;
        width: 100%;
        padding: 20px;
        background: #1a1a1a;
        border-top: 1px solid #333;
    }

    .message-container {
        display: flex;
        margin: 8px;
        max-width: 80%;
    }

    .message-container.right {
        margin-left: auto;
    }

    .message-container.left {
        margin-right: auto;
    }

    .message {
        padding: 10px;
        border-radius: 12px;
        position: relative;
        max-width: 100%;
    }

    .sent {
        background: #0084ff;
        color: white;
        margin-left: auto;
    }

    .received {
        background: #333;
        color: white;
    }

    .quoted-message {
        background: rgba(255, 255, 255, 0.1);
        padding: 8px;
        border-left: 3px solid #0084ff;
        margin-bottom: 8px;
        border-radius: 4px;
    }

    .message-time {
        font-size: 0.8em;
        opacity: 0.7;
        margin-top: 4px;
    }

    .quote-btn {
        opacity: 0;
        transition: opacity 0.2s;
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        padding: 4px;
        margin-left: 8px;
    }

    .message:hover .quote-btn {
        opacity: 1;
    }
`;
document.head.appendChild(chatStyle);

// Update the socket connection to store userId
socket.on('connect', () => {
    if (currentUserId && currentUserName) {
        socket.userId = currentUserId;
        socket.userName = currentUserName;
        
        // Emit that the user is online when connected
        socket.emit("userOnline", currentUserId);
    }
});

// Initialize and handle user status panel
let statusPanelOpen = false;
let inactivityTimer;
const INACTIVITY_TIME = 30000; // 30 seconds of inactivity before going to away status

function initializeUserStatus() {
    const statusToggle = document.getElementById('status-toggle');
    const statusContainer = document.getElementById('status-container');
    const closeStatus = document.getElementById('close-status');
    const usersStatusDiv = document.getElementById('users-status');
    const onlineUsersIndicator = document.getElementById('online-users-indicator');
    const userSearchInput = document.getElementById('user-search');
    
    // Function to open status panel
    function openStatusPanel() {
        statusPanelOpen = true;
        statusContainer.style.right = '0';
        fetchUserStatus();
        
        // Focus search input when panel opens
        if (userSearchInput) {
            setTimeout(() => userSearchInput.focus(), 300);
        }
    }
    
    // Function to close status panel
    function closeStatusPanel() {
        statusPanelOpen = false;
        statusContainer.style.right = '-450px';
        
        // Clear search when panel closes
        if (userSearchInput) {
            userSearchInput.value = '';
        }
    }
    
    // Toggle status panel visibility with the float button
    statusToggle.addEventListener('click', () => {
        if (statusPanelOpen) {
            closeStatusPanel();
        } else {
            openStatusPanel();
        }
    });
    
    // Close with the X button
    closeStatus.addEventListener('click', closeStatusPanel);
    
    // Open with header indicator
    if (onlineUsersIndicator) {
        onlineUsersIndicator.addEventListener('click', openStatusPanel);
    }
    
    // Add search functionality
    if (userSearchInput) {
        userSearchInput.addEventListener('input', filterUsers);
    }
    
    // Setup activity monitoring to manage user status
    setupActivityMonitoring();
    
    // Handle socket events for user status updates
    socket.on("updateUserStatus", ({ online, away }) => {
        // Store the status arrays in window variables for searching
        window.onlineUsers = online;
        window.awayUsers = away;
        
        console.log("Received status update:", { 
            online, 
            away,
            currentUserId,
            isCurrentUserOnline: online.includes(currentUserId.toString())
        });
        
        updateUserStatusUI(online, away);
    });
}

function fetchUserStatus() {
    fetch("/api/users")
        .then(response => response.json())
        .then(data => {
            // Request current online/away status from server
            socket.emit("requestStatusUpdate");
            
            // Store all users for filtering
            window.allUsers = data.all_users;
            window.userLogoutTimes = data.user_logout_times;
        })
        .catch(err => {
            console.error("Error fetching users:", err);
            showToast("Failed to load user status information", "error");
        });
}

function updateUserStatusUI(onlineUsers = [], awayUsers = []) {
    if (!window.allUsers) return;
    console.log("UserDashbord",onlineUsers)
    const usersStatusDiv = document.getElementById('users-status');
    usersStatusDiv.innerHTML = "";
    
    const searchInput = document.getElementById('user-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    // Update user counter in header
    const userCounter = document.getElementById('user-counter');
    const onlineCount = onlineUsers.length;
    userCounter.textContent = `(${onlineCount} online)`;
    userCounter.className = 'user-counter ' + (onlineCount > 0 ? 'has-online' : '');
    
    // Update header online indicator
    const headerOnlineCount = document.getElementById('header-online-count');
    if (headerOnlineCount) {
        headerOnlineCount.textContent = `(${onlineCount} online)`;
    }
    
    // Add current user profile section
    const currentUserProfile = document.createElement('div');
    currentUserProfile.classList.add('current-user-profile');
    
    // Determine current user status
    const isCurrentUserOnline = onlineUsers.includes(currentUserId.toString());
    const isCurrentUserAway = awayUsers.includes(currentUserId.toString());
    let currentUserStatusText = "Offline";
    let currentUserStatusClass = "offline";
    let currentUserStatusIcon = `<i class="fas fa-circle-xmark offline-icon"></i>`;
    
    if (isCurrentUserOnline) {
        currentUserStatusText = "Available";
        currentUserStatusClass = "online";
        currentUserStatusIcon = `<i class="fas fa-circle-check online-icon"></i>`;
    } else if (isCurrentUserAway) {
        currentUserStatusText = "Away";
        currentUserStatusClass = "away";
        currentUserStatusIcon = `<i class="fas fa-clock away-icon"></i>`;
    }
    
    // Fetch user role from session data
    fetch('/api/auth/user-info')
        .then(response => response.json())
        .then(data => {
            const userRole = data.role || 'user';
            const roleLabel = userRole === 'admin' ? 'Admin' : 'User';
            const roleLabelClass = userRole === 'admin' ? 'admin-label' : 'user-label';
            
            currentUserProfile.innerHTML = `
                <div class="profile-header">
                    <h3>Your Profile</h3>
                </div>
                <div class="profile-content">
                    <div class="profile-info">
                        <div class="profile-name-container">
                            <span class="profile-name">${currentUserName}</span>
                            <span class="role-label ${roleLabelClass}">${roleLabel}</span>
                        </div>
                        <div class="profile-status ${currentUserStatusClass}">
                            ${currentUserStatusIcon} <span class="status-text">${currentUserStatusText}</span>
                        </div>
                    </div>
                </div>
            `;
            
            usersStatusDiv.replaceChildren(currentUserProfile);
            
            // Add divider
            const divider = document.createElement('div');
            divider.classList.add('users-divider');
            usersStatusDiv.appendChild(divider);
            
            // Continue with user stats counter
            addUserStats(usersStatusDiv, onlineCount, awayUsers.length, window.allUsers.length, searchTerm);
        })
        .catch(err => {
            console.error("Error fetching user role:", err);
            // Fallback if user role fetch fails
            currentUserProfile.innerHTML = `
                <div class="profile-header">
                    <h3>Your Profile</h3>
                </div>
                <div class="profile-content">
                    <div class="profile-info">
                        <div class="profile-name-container">
                            <span class="profile-name">${currentUserName}</span>
                            <span class="role-label user-label">User</span>
                        </div>
                        <div class="profile-status ${currentUserStatusClass}">
                            ${currentUserStatusIcon} <span class="status-text">${currentUserStatusText}</span>
                        </div>
                    </div>
                </div>
            `;
            
            usersStatusDiv.replaceChildren(currentUserProfile);
            
            // Add divider
            const divider = document.createElement('div');
            divider.classList.add('users-divider');
            usersStatusDiv.appendChild(divider);
            
            // Continue with user stats counter
            addUserStats(usersStatusDiv, onlineCount, awayUsers.length, window.allUsers.length, searchTerm);
        });
}

// Function to add user stats section - extracted from updateUserStatusUI
function addUserStats(usersStatusDiv, onlineCount, awayCount, totalCount, searchTerm) {
    // Add user stats counter
    const statsDiv = document.createElement('div');
    statsDiv.classList.add('user-stats');
    
    // Count users by status
    const offlineCount = totalCount - onlineCount - awayCount;
    
    statsDiv.innerHTML = `
        <div class="status-counts">
            <div class="status-count online">
                <i class="fas fa-circle-check"></i> ${onlineCount} Online
            </div>
            <div class="status-count away">
                <i class="fas fa-clock"></i> ${awayCount} Away
            </div>
            <div class="status-count offline">
                <i class="fas fa-circle-xmark"></i> ${offlineCount} Offline
            </div>
        </div>
    `;
    
    // Add view all button if searching
    if (searchTerm) {
        const viewAllBtn = document.createElement('button');
        viewAllBtn.classList.add('view-all-btn');
        viewAllBtn.innerHTML = `<i class="fas fa-list"></i> View All Users`;
        viewAllBtn.addEventListener('click', () => {
            searchInput.value = '';
            updateUserStatusUI(window.onlineUsers, window.awayUsers);
        });
        statsDiv.appendChild(viewAllBtn);
    }
    
    usersStatusDiv.appendChild(statsDiv);
    
    // Create users list section
    const usersListSection = document.createElement('div');
    usersListSection.classList.add('users-list-section');
    usersListSection.innerHTML = `<h3>Other Users</h3>`;
    usersStatusDiv.appendChild(usersListSection);
    
    // Create filtered users list (excluding current user)
    createUsersList(usersListSection, searchTerm);
}

// Function to create the users list - extracted from updateUserStatusUI
function createUsersList(container, searchTerm) {
    let filteredUsers = [];
    
    // First add online users
    window.allUsers.forEach(user => {
        const userName = user.name;
        // Skip current user
        if (userName === currentUserName) {
            return;
        }
        
        // Get user ID from user object if available
        let userId;
        
        if (user.id) {
            userId = user.id.toString();
        } else {
            // If ID is not available, try to find it
            const userObj = window.allUsers.find(u => u.name === userName && u.id);
            userId = userObj ? userObj.id.toString() : null;
        }
        
        // Check if user is online by ID if possible, otherwise fallback to name
        const isOnline = userId ? window.onlineUsers.includes(userId) : window.onlineUsers.includes(userName);
        
        // Skip if not online or doesn't match search
        if (!isOnline || (searchTerm && !userName.toLowerCase().includes(searchTerm))) {
            return;
        }
        
        filteredUsers.push({
            userName,
            userId,
            isOnline: true, 
            isAway: false
        });
    });
    
    // Then add away users
    window.allUsers.forEach(user => {
        const userName = user.name;
        // Skip current user
        if (userName === currentUserName) {
            return;
        }
        
        // Get user ID from user object if available
        let userId;
        
        if (user.id) {
            userId = user.id.toString();
        } else {
            // If ID is not available, try to find it
            const userObj = window.allUsers.find(u => u.name === userName && u.id);
            userId = userObj ? userObj.id.toString() : null;
        }
        
        // Check if user is away by ID if possible, otherwise fallback to name
        const isAway = userId ? window.awayUsers.includes(userId) : window.awayUsers.includes(userName);
        
        // Skip if not away or doesn't match search or already added
        if (!isAway || (searchTerm && !userName.toLowerCase().includes(searchTerm)) || 
            filteredUsers.some(u => u.userName === userName)) {
            return;
        }
        
        filteredUsers.push({
            userName,
            userId,
            isOnline: false, 
            isAway: true
        });
    });
    
    // Finally add offline users
    window.allUsers.forEach(user => {
        const userName = user.name;
        // Skip current user
        if (userName === currentUserName) {
            return;
        }
        
        // Get user ID from user object if available
        let userId;
        
        if (user.id) {
            userId = user.id.toString();
        } else {
            // If ID is not available, try to find it
            const userObj = window.allUsers.find(u => u.name === userName && u.id);
            userId = userObj ? userObj.id.toString() : null;
        }
        
        // Check if user is online or away by ID if possible, otherwise fallback to name
        const isOnline = userId ? window.onlineUsers.includes(userId) : window.onlineUsers.includes(userName);
        const isAway = userId ? window.awayUsers.includes(userId) : window.awayUsers.includes(userName);
        
        // Skip if online/away or doesn't match search or already added
        if (isOnline || isAway || (searchTerm && !userName.toLowerCase().includes(searchTerm)) || 
            filteredUsers.some(u => u.userName === userName)) {
            return;
        }
        
        filteredUsers.push({
            userName,
            userId,
            isOnline: false, 
            isAway: false
        });
    });
    
    // Users list container
    const usersListContainer = document.createElement('div');
    usersListContainer.classList.add('users-list-container');
    
    // Render filtered users
    filteredUsers.forEach(({userName, isOnline, isAway}) => {
        const userDiv = document.createElement("div");
        userDiv.classList.add("user-status");
        
        let statusText = "Offline";
        let statusClass = "offline";
        let statusIcon = `<i class="fas fa-circle-xmark offline-icon"></i>`; // default offline
        let logoutTimestamp = "";
        
        if (isOnline) {
            statusText = "Available";
            statusClass = "online";
            statusIcon = `<i class="fas fa-circle-check online-icon"></i>`;
        } else if (isAway) {
            statusText = "Away";
            statusClass = "away";
            statusIcon = `<i class="fas fa-clock away-icon"></i>`;
        } else {
            // Get last logout timestamp for this user
            const userLogout = window.userLogoutTimes.find(logout => logout.name === userName);
            if (userLogout && userLogout.last_logout) {
                const logoutDate = new Date(userLogout.last_logout);
                logoutTimestamp = `<div class="last-seen">Last seen: ${formatTimestamp(logoutDate)}</div>`;
            }
        }
        
        userDiv.innerHTML = `
            <div class="user-info">
                <span class="user-name">${userName}</span>
                ${logoutTimestamp}
            </div>
            <div class="status ${statusClass}">
                ${statusIcon} <span class="status-text">${statusText}</span>
            </div>
            <button class="message-user-btn" title="Message ${userName}" data-username="${userName}">
                <i class="fas fa-paper-plane"></i>
            </button>
        `;
        
        usersListContainer.appendChild(userDiv);
        
        // Add event listener for message button
        const messageBtn = userDiv.querySelector('.message-user-btn');
        messageBtn.addEventListener('click', () => {
            // Redirect to direct message page with this user
            window.location.href = `DMs.html?user=${encodeURIComponent(userName)}`;
        });
    });
    
    container.appendChild(usersListContainer);
    
    // Show "no users found" message if search has no results
    if (filteredUsers.length === 0 && searchTerm) {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.classList.add('no-users-found');
        noResultsDiv.innerHTML = `<i class="fas fa-search"></i> No users found matching "${searchTerm}"`;
        container.appendChild(noResultsDiv);
    }
}

function filterUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    updateUserStatusUI(window.onlineUsers, window.awayUsers);
}

function formatTimestamp(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function setupActivityMonitoring() {
    // Monitor user activity to update status
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Variable to track last activity time
    let lastActivityTime = Date.now();
    let isAway = false;
    
    // Function to handle user activity
    function handleUserActivity() {
        const now = Date.now();
        
        // If user was away, set them back to online
        if (isAway) {
            console.log('User returned from away state');
            socket.emit("userOnline", currentUserId);
            isAway = false;
        }
        
        // Update last activity time
        lastActivityTime = now;
    }
    
    // Add event listeners for user activity
    activityEvents.forEach(event => {
        document.addEventListener(event, handleUserActivity);
    });
    
    // Set up periodic check for inactivity
    const inactivityChecker = setInterval(() => {
        const now = Date.now();
        
        // If user has been inactive for the threshold and is not already away
        if (!isAway && (now - lastActivityTime > INACTIVITY_TIME)) {
            console.log('User has gone away due to inactivity');
            socket.emit("userAway", currentUserId);
            isAway = true;
        }
    }, 5000); // Check every 5 seconds
    
    // Ensure initial online status is sent
    if (currentUserId) {
        socket.emit("userOnline", currentUserId);
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(inactivityChecker);
    });
}

// Add status panel styling
const statusStyle = document.createElement('style');
statusStyle.textContent = `
    #status-toggle {
        position: fixed;
        right: 30px;
        bottom: 100px; /* Position above the chat toggle */
        width: 60px;
        height: 60px;
        background: var(--dark-grey);
        color: var(--text-light);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 999;
        border: 2px solid var(--yellow);
    }
    
    #status-toggle:hover {
        background: var(--yellow);
        color: var(--dark-grey);
        transform: scale(1.1);
        box-shadow: 0 5px 20px rgba(251, 202, 31, 0.4);
    }
    
    #status-toggle i {
        font-size: 1.5em;
        transition: transform 0.3s ease;
    }
    
    #status-toggle:hover i {
        transform: rotate(15deg);
    }
    
    #status-container {
        position: fixed;
        right: -450px;
        top: 0;
        width: 450px;
        height: 100vh;
        background: #1a1a1a;
        transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: -5px 0 25px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        z-index: 1000;
        border-left: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    #users-status {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .user-search-container {
        position: relative;
        margin-right: 10px;
        flex: 1;
    }
    
    .user-search-input {
        padding: 8px 32px 8px 12px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border-radius: 20px;
        width: 100%;
        font-size: 0.9em;
        transition: all 0.3s ease;
    }
    
    .user-search-input:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.15);
        box-shadow: 0 0 0 2px rgba(251, 202, 31, 0.2);
    }
    
    .search-icon {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(255, 255, 255, 0.5);
        pointer-events: none;
    }
    
    .user-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        transition: all 0.3s ease;
    }
    
    .user-status:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(-5px);
    }
    
    .user-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
         flex: 3;
    }
    
    .user-name {
        font-weight: 500;
        color: #fff;
    }
    
    .current-user {
        color: var(--yellow);
    }
    
    .last-seen {
        font-size: 0.75em;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85em;
        padding: 4px 8px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        flex: 2;
    }
    
    .status.online {
        color: #2ecc71;
    }
    
    .status.away {
        color: var(--yellow);
    }
    
    .status.offline {
        color: #7f8c8d;
    }
    
    .status-text {
        font-size: 0.8em;
    }
    
    .online-icon {
        color: #2ecc71;
        animation: pulse 2s infinite;
    }
    
    .away-icon {
        color: var(--yellow);
        animation: pulse 3s infinite;
    }
    
    .offline-icon {
        color: #7f8c8d;
    }
    
    .message-user-btn {
        background: none;
        border: none;
        color: #fff;
        opacity: 0.7;
        cursor: pointer;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1em;
        border-radius: 50%;
        transition: all 0.3s ease;
    }
    
    .message-user-btn:hover {
        opacity: 1;
        background: var(--dark-grey);
        color: var(--yellow);
        transform: scale(1.1);
    }
    
    .no-users-found {
        padding: 20px;
        text-align: center;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }
    
    .no-users-found i {
        font-size: 2em;
        color: rgba(255, 255, 255, 0.3);
    }
    
    .user-stats {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 15px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .status-counts {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .status-count {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85em;
        padding: 5px 10px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.08);
    }
    
    .status-count.online {
        color: #2ecc71;
    }
    
    .status-count.away {
        color: var(--yellow);
    }
    
    .status-count.offline {
        color: #7f8c8d;
    }
    
    .view-all-btn {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        color: #fff;
        padding: 8px 12px;
        border-radius: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.9em;
        transition: all 0.3s ease;
        margin-top: 8px;
        width: 100%;
    }
    
    .view-all-btn:hover {
        background: var(--yellow);
        color: var(--dark-grey);
    }
    
    .user-counter {
        font-size: 0.8em;
        opacity: 0.7;
        margin-left: 6px;
        font-weight: normal;
    }
    
    .user-counter.has-online {
        color: #2ecc71;
        opacity: 1;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.6; }
        100% { opacity: 1; }
    }
`;
document.head.appendChild(statusStyle);

// Add reconnection handler
socket.on('reconnect', () => {
    if (currentUserId && currentUserName) {
        socket.userId = currentUserId;
        socket.userName = currentUserName;
        
        // Re-emit that the user is online when reconnected
        socket.emit("userOnline", currentUserId);
    }
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
        chatFrame.contentWindow.postMessage({ action: 'openChat' }, '*');
    }
});

// Listen for messages from the chatbot iframe
window.addEventListener('message', (event) => {
    if (event.data.action === 'closeChat') {
        chatFrame.style.display = "none";
    }
});