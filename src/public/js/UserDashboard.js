let userTeams = {};
const socket = io('ws://localhost:3000', {
    withCredentials: true
});
let globalChatOpen = false;

// Initialize user data and socket connection
let currentUserId = null;
let currentUserName = null;
let currentUserRole = null;

function fetchUserTeams() {
    fetch('/get-user-teams')
        .then(response => response.json())
        .then(teams => {
            userTeams = {};  // Reset userTeams object
            const teamsContainer = document.getElementById("teams-container");
            teamsContainer.innerHTML = "";

            teams.forEach(team => {
                // Store team data
                userTeams[team.teamId] = team;
                
                // Create team card
                let teamElement = document.createElement("div");
                teamElement.classList.add("team-card");

                let teamHeader = document.createElement("div");
                teamHeader.classList.add("team-header");
                teamHeader.innerHTML = `
                    <h3>(${team.teamId}) ${team.teamName}</h3>
                    <p><strong>Created by:</strong> ${team.creatorName || "Unknown"}</p>
                    <div class="team-members">
                        <strong>Members:</strong> ${team.members.length > 0 ? team.members.join(", ") : "No members"}
                    </div>
                `;

                // Add channel creation form
                let createChannelForm = document.createElement("div");
                createChannelForm.classList.add("create-channel-form");
                createChannelForm.innerHTML = `
                    <div class="channel-form-header">
                        <button class="btn show-channel-form">
                            <i class="fas fa-plus"></i> Create Channel
                        </button>
                    </div>
                    <form class="channel-form" style="display: none;">
                        <input type="text" class="channel-name-input" placeholder="Enter Channel Name" required>
                        <div class="channel-helper">Channel name can contain letters, numbers, hyphens and underscores</div>
                        <button type="submit" class="btn create-channel-btn">
                            <i class="fas fa-plus"></i> Create
                        </button>
                    </form>
                `;

                // Add event listeners for channel creation
                const showFormBtn = createChannelForm.querySelector('.show-channel-form');
                const channelForm = createChannelForm.querySelector('.channel-form');
                const channelNameInput = createChannelForm.querySelector('.channel-name-input');

                showFormBtn.addEventListener('click', () => {
                    channelForm.style.display = channelForm.style.display === 'none' ? 'block' : 'none';
                });

                channelForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const channelName = channelNameInput.value.trim();

                    if (!channelName) {
                        showToast("Channel name is required", "error");
                        return;
                    }

                    // Validate channel name format
                    const channelNameRegex = /^[a-zA-Z0-9_-]+$/;
                    if (!channelNameRegex.test(channelName)) {
                        showToast("Channel name can only contain letters, numbers, hyphens and underscores", "error");
                        return;
                    }

                    try {
                        const response = await fetch('/create-channel', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                channelName: channelName,
                                teamId: team.teamId
                            })
                        });

                        const data = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(data.error || 'Failed to create channel');
                        }

                        showToast("Channel created successfully!", "success");
                        channelForm.style.display = 'none';
                        channelNameInput.value = '';
                        fetchUserTeams(); // Refresh the teams display
                    } catch (err) {
                        console.error("Error creating channel:", err);
                        showToast(err.message || "Failed to create channel", "error");
                    }
                });

                let channelsSection = document.createElement("div");
                channelsSection.classList.add("channels-section");

                console.log(team)
                // Display channels
                if (team.channels && Object.keys(team.channels).length > 0) {
                    Object.values(team.channels).forEach(channel => {
                        let channelElement = document.createElement("div");
                        channelElement.classList.add("channel-item");
                        
                        let channelContent = document.createElement("div");
                        channelContent.classList.add("channel-content");
                        channelContent.innerHTML = `
                            <div class="channel-header">
                                <h4>📢 ${channel.channelName}</h4>
                                <button class="assign-user-btn" title="Assign User">
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                            <p class="channel-members"><strong>Members:</strong> ${channel.members.length > 0 ? channel.members.join(", ") : "No members"}</p>
                        `;

                        // Create hidden assignment form
                        let assignForm = document.createElement("div");
                        assignForm.classList.add("channel-assign-form");
                        assignForm.style.display = "none";
                        
                        // Filter out members already in the channel
                        const availableMembers = team.members.filter(member => 
                            !channel.members.includes(member)
                        );

                        assignForm.innerHTML = `
                            <div class="assign-form-content">
                                <select class="team-members-select">
                                    <option value="">Select Team Member</option>
                                    ${availableMembers.map(member => 
                                        `<option value="${member}">${member}</option>`
                                    ).join('')}
                                </select>
                                <button class="btn assign-btn" disabled>
                                    <i class="fas fa-plus"></i> Add
                                </button>
                                <button class="btn cancel-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;

                        // Add event listeners
                        const assignUserBtn = channelContent.querySelector('.assign-user-btn');
                        assignUserBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close any other open forms first
                            document.querySelectorAll('.channel-assign-form').forEach(form => {
                                if (form !== assignForm) {
                                    form.style.display = "none";
                                }
                            });
                            assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
                        });

                        const cancelBtn = assignForm.querySelector('.cancel-btn');
                        cancelBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            assignForm.style.display = "none";
                        });

                        const memberSelect = assignForm.querySelector('.team-members-select');
                        const assignBtn = assignForm.querySelector('.assign-btn');
                        
                        memberSelect.addEventListener('change', () => {
                            assignBtn.disabled = !memberSelect.value;
                        });

                        assignBtn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const selectedUser = memberSelect.value;
                            if (!selectedUser) {
                                showToast("Please select a team member", "error");
                                return;
                            }

                            // Disable the button and show loading state
                            assignBtn.disabled = true;
                            assignBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

                            try {
                                const response = await fetch('/assign-user', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        teamId: team.teamId,
                                        channelName: channel.channelName,
                                        userName: selectedUser
                                    })
                                });

                                const data = await response.json();
                                
                                if (!response.ok) {
                                    throw new Error(data.error || 'Failed to assign user');
                                }

                                // Show success notification
                                showToast(`Successfully assigned ${selectedUser} to channel ${channel.channelName}`, "success");
                                
                                // Update the members list with the new data
                                const membersP = channelContent.querySelector('.channel-members');
                                membersP.innerHTML = `<strong>Members:</strong> ${data.updatedMembers.join(', ')}`;
                                
                                // Hide the form
                                assignForm.style.display = "none";
                                
                                // Reset the form
                                memberSelect.value = '';
                                assignBtn.disabled = true;

                                // Remove the assigned user from the dropdown
                                Array.from(memberSelect.options).forEach(option => {
                                    if (option.value === selectedUser) {
                                        option.remove();
                                    }
                                });

                                // If no more members to add, disable the assign button
                                if (memberSelect.options.length <= 1) { // Only the default option left
                                    assignUserBtn.disabled = true;
                                    assignUserBtn.title = 'All team members are already in this channel';
                                }

                            } catch (err) {
                                console.error("Error assigning user:", err);
                                showToast(err.message || "Failed to assign user", "error");
                            } finally {
                                // Reset button state
                                assignBtn.disabled = false;
                                assignBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
                            }
                        });

                        channelElement.appendChild(channelContent);
                        channelElement.appendChild(assignForm);
                        channelsSection.appendChild(channelElement);
                    });
                } else {
                    let noChannelsMsg = document.createElement("p");
                    noChannelsMsg.textContent = "No channels yet";
                    noChannelsMsg.style.fontStyle = "italic";
                    channelsSection.appendChild(noChannelsMsg);
                }

                let teamsButton = document.createElement("button");
                teamsButton.textContent = "Open Team Chat";
                teamsButton.classList.add("teamsButton");
                teamsButton.addEventListener("click", () => {
                    window.location.href = `channel_chat.html?team=${encodeURIComponent(team.teamName)}`;
                });

                teamElement.appendChild(teamHeader);
                teamElement.appendChild(createChannelForm);
                teamElement.appendChild(channelsSection);
                teamElement.appendChild(teamsButton);
                teamsContainer.appendChild(teamElement);
            });
        })
        .catch(err => {
            console.error("Error fetching teams:", err);
            showToast("Failed to load teams. Please try again.", "error");
        });
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

    // Log user role for debugging
    console.log("Initializing global chat for user:", currentUserName, "Role:", currentUserRole);

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

    // Improved Emoji picker initialization
    let picker = null;
    
    function initEmojiPicker() {
        if (!picker && window.EmojiMart) {
            try {
                picker = new EmojiMart.Picker({
                    onEmojiSelect: (emoji) => {
                        messageInput.value += emoji.native;
                        messageInput.focus();
                    },
                    theme: 'dark',
                    set: 'native',
                    showPreview: false,
                    showSkinTones: true,
                    emojiSize: 20
                });
                
                // Clear and append the picker
                emojiPickerContainer.innerHTML = '';
                emojiPickerContainer.appendChild(picker);
                console.log("Emoji picker initialized successfully");
            } catch (e) {
                console.error("Error initializing emoji picker:", e);
            }
        } else if (!window.EmojiMart) {
            console.error("EmojiMart not loaded yet");
        }
    }
    
    // Initialize emoji picker when button is clicked
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from closing the picker immediately
        
        // Initialize picker if not already done
        if (!picker) {
            initEmojiPicker();
        }
        
        // Toggle the emoji picker display
        if (emojiPickerContainer.style.display === 'none' || !emojiPickerContainer.style.display) {
            emojiPickerContainer.style.display = 'block';
        } else {
            emojiPickerContainer.style.display = 'none';
        }
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

    // Click outside emoji picker to close it
    document.addEventListener('click', (e) => {
        if (emojiPickerContainer.style.display === 'block' && 
            !emojiPickerContainer.contains(e.target) && 
            e.target !== emojiBtn) {
            emojiPickerContainer.style.display = 'none';
        }
    });

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Handle incoming messages
    socket.on('global-message', (message) => {
        appendMessage(message);
        if (!globalChatOpen) {
            showToast('New message in Global Chat', 'info');
        }
    });

    // Handle removed messages
    socket.on('global-message-removed', (data) => {
        const messageId = data.id;
        const messageElements = document.querySelectorAll('.message-container');
        
        messageElements.forEach(element => {
            if (element.dataset.messageId === messageId.toString()) {
                // Skip if already moderated
                if (isMessageModerated(element)) return;
                
                const messageText = element.querySelector('.message-text');
                if (messageText) {
                    messageText.textContent = 'Removed by Moderator';
                    messageText.classList.add('removed-message');
                    
                    // Add visual indication that a moderator removed this message
                    const moderatorFlag = document.createElement('div');
                    moderatorFlag.className = 'moderator-flag';
                    moderatorFlag.innerHTML = '<i class="fas fa-shield-alt"></i> Moderated';
                    
                    // Check if the flag is already there to avoid duplicates
                    if (!element.querySelector('.moderator-flag')) {
                        element.querySelector('.message-content').appendChild(moderatorFlag);
                    }
                }
                
                // Remove any action buttons
                const buttons = element.querySelectorAll('button');
                buttons.forEach(button => {
                    if (button.classList.contains('quote-btn') || button.classList.contains('delete-btn')) {
                        button.remove();
                    }
                });
            }
        });
    });

    // Load chat history
    socket.on('global-chat-history', (messages) => {
        chatMessages.innerHTML = '';
        messages.forEach(appendMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // Initialize emoji picker after chat is ready
    setTimeout(initEmojiPicker, 500);

    function appendMessage(message) {
        const messageDiv = document.createElement('div');
        const isMyMessage = message.sender_id === currentUserId;
        const isAdmin = currentUserRole === "admin";
        messageDiv.className = `message-container ${isMyMessage ? 'right' : 'left'}`;
        messageDiv.dataset.messageId = message.id;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Handle both message formats from different sources
        const messageText = message.message || message.text;
        const isModerated = messageText === 'Removed by Moderator' || messageText === 'Removed by Admin';
        
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
                    <div class="message-text ${isModerated ? 'removed-message' : ''}">${messageText}</div>
                    <div class="message-time">${time}</div>
                    ${!isModerated ? `
                    <button class="quote-btn" title="Reply to this message">
                        <i class="fas fa-reply"></i>
                    </button>
                    ` : ''}
                    ${isAdmin && !isModerated ? `
                    <button class="delete-btn" title="Delete message">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                    ${isModerated ? `
                    <div class="moderator-flag">
                        <i class="fas fa-shield-alt"></i> Moderated
                    </div>
                    ` : ''}
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
        
        // Add delete functionality for admin
        if (isAdmin) {
            const deleteBtn = messageDiv.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteGlobalMessage(message.id, messageDiv);
                });
            }
        }
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Function to fetch and display private channels (groups)
function fetchPrivateChannels() {
    const privateChannelsContainer = document.getElementById("private-channels-container");
    privateChannelsContainer.innerHTML = '<div class="private-channels-loading"><i class="fas fa-spinner fa-spin"></i> Loading your private channels...</div>';

    fetch("/get-groups")
        .then(response => response.json())
        .then(groups => {
            privateChannelsContainer.innerHTML = "";

            if (groups.length === 0) {
                privateChannelsContainer.innerHTML = `
                    <div class="no-private-channels">
                        <i class="fas fa-users-slash"></i>
                        <p>You don't have any private channels yet</p>
                    </div>
                `;
                return;
            }

            // Create a card for each group that the user is a member of
            let fetchingCount = 0;
            let privateChannels = [];

            const checkGroupsComplete = () => {
                if (fetchingCount === 0) {
                    if (privateChannels.length === 0) {
                        privateChannelsContainer.innerHTML = `
                            <div class="no-private-channels">
                                <i class="fas fa-users-slash"></i>
                                <p>You don't have any private channels yet</p>
                            </div>
                        `;
                        return;
                    }

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
                        
                        privateChannelsContainer.appendChild(card);
                    });
                }
            };

            // Check membership for each group
            groups.forEach(group => {
                fetchingCount++;
                fetch(`/group-members/${group.id}`)
                    .then(response => response.json())
                    .then(members => {
                        // Check if current user is a member
                        const isMember = members.some(member => member.id === currentUserId);
                        if (isMember) {
                            privateChannels.push({
                                ...group,
                                memberCount: members.length
                            });
                        }
                        fetchingCount--;
                        checkGroupsComplete();
                    })
                    .catch(err => {
                        console.error(`Error fetching members for group ${group.id}:`, err);
                        fetchingCount--;
                        checkGroupsComplete();
                    });
            });
        })
        .catch(err => {
            console.error("Error fetching private channels:", err);
            privateChannelsContainer.innerHTML = `
                <div class="no-private-channels" style="color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load private channels. Please try again.</p>
                </div>
            `;
        });
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            document.getElementById('username').textContent = data.name;
            currentUserId = data.id;
            currentUserName = data.name;
            currentUserRole = data.role;
            socket.userId = data.id;
            socket.userName = data.name;
            
            // Signal that the user is online after all data is loaded
            console.log("Emitting online status for user ID:", currentUserId);
            console.log("User role:", currentUserRole);
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

// User status panel functionality
function initializeUserStatus() {
    // Get DOM elements
    const statusToggle = document.getElementById('status-toggle');
    const statusContainer = document.getElementById('status-container');
    const closeStatus = document.getElementById('close-status');
    const searchInput = document.getElementById('user-search');
    
    // Track panel state
    let statusPanelOpen = false;
    
    // Open status panel and fetch data
    function openStatusPanel() {
        statusContainer.style.right = '0';
        statusPanelOpen = true;
        
        // Show loading state
        document.getElementById('users-status').innerHTML = `
            <div class="loading-container">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading users...</p>
            </div>
        `;
        
        // Fetch user data
        fetchUserData();
        
        // Focus search input
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 300);
        }
    }
    
    // Close status panel
    function closeStatusPanel() {
        statusContainer.style.right = '-300px';
        statusPanelOpen = false;
        
        // Clear search when panel closes
        if (searchInput) {
            searchInput.value = '';
        }
    }
    
    // Toggle panel visibility
    statusToggle.addEventListener('click', () => {
        if (statusPanelOpen) {
            closeStatusPanel();
        } else {
            openStatusPanel();
        }
    });
    
    // Close button event
    closeStatus.addEventListener('click', closeStatusPanel);
    
    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderUsers(window.onlineUsers || [], window.awayUsers || []);
        });
    }
    
    // Listen for header indicator clicks
    const onlineUsersIndicator = document.getElementById('online-users-indicator');
    if (onlineUsersIndicator) {
        onlineUsersIndicator.addEventListener('click', openStatusPanel);
    }
    
    // Set up activity monitoring
    setupActivityMonitoring();
    
    // Listen for user status updates
    socket.on('updateUserStatus', ({ online, away }) => {
        // Save to window for access in other functions
        window.onlineUsers = online || [];
        window.awayUsers = away || [];
        
        // Update header counter
        updateOnlineCounter(online ? online.length : 0);
        
        // Only update full UI if panel is open
        if (statusPanelOpen) {
            renderUsers(online, away);
        }
    });
}

// Fetch all user data
function fetchUserData() {
    fetch('/api/users')
        .then(response => response.json())
        .then(data => {
            // Store users data
            window.allUsers = data.all_users || [];
            window.userLogoutTimes = data.user_logout_times || [];
            
            // Request status updates from server
            socket.emit('requestStatusUpdate');
        })
        .catch(error => {
            console.error('Error fetching users:', error);
            document.getElementById('users-status').innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to load user data</p>
                    <button id="retry-fetch-btn" class="btn">Try Again</button>
                </div>
            `;
            
            // Add retry handler
            document.getElementById('retry-fetch-btn').addEventListener('click', fetchUserData);
        });
}

// Update counter in header
function updateOnlineCounter(count) {
    // Update main counter
    const userCounter = document.getElementById('user-counter');
    if (userCounter) {
        userCounter.textContent = `(${count} online)`;
    }
    
    // Update header indicator counter
    const headerCounter = document.getElementById('header-online-count');
    if (headerCounter) {
        headerCounter.textContent = `(${count} online)`;
    }
}

// Render users in status panel
function renderUsers(onlineUsers = [], awayUsers = []) {
    // Get required data
    if (!window.allUsers) return;
    
    const usersStatusDiv = document.getElementById('users-status');
    const searchInput = document.getElementById('user-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    // Clear container
    usersStatusDiv.innerHTML = '';
    
    // Create UI containers
    const container = document.createElement('div');
    container.className = 'status-panel-content';
    
    // 1. User's own profile section
    container.appendChild(createUserProfile(currentUserId, currentUserName, onlineUsers, awayUsers));
    
    // 2. User stats section
    container.appendChild(createStatsSection(onlineUsers, awayUsers, window.allUsers.length));
    
    // 3. All users section (filtered by search if needed)
    container.appendChild(createUsersSection(searchTerm, onlineUsers, awayUsers));
    
    // Add container to panel
    usersStatusDiv.appendChild(container);
}

// Create user's own profile card
function createUserProfile(userId, userName, onlineUsers, awayUsers) {
    const section = document.createElement('div');
    section.className = 'status-section';
    
    // Determine user status
    const isOnline = onlineUsers.includes(userId.toString());
    const isAway = awayUsers.includes(userId.toString());
    
    let statusText = 'Offline';
    let statusClass = 'status-offline';
    let statusIcon = '<i class="fas fa-circle-xmark offline-icon"></i>';
    
    if (isOnline) {
        statusText = 'Available';
        statusClass = 'status-online';
        statusIcon = '<i class="fas fa-circle-check online-icon"></i>';
    } else if (isAway) {
        statusText = 'Away';
        statusClass = 'status-away';
        statusIcon = '<i class="fas fa-clock away-icon"></i>';
    }
    
    section.innerHTML = `
        <h3 class="status-section-title">Your Profile</h3>
        <div class="user-profile-card">
            <div class="user-profile-header">
                <div class="user-profile-name">${userName}</div>
                <div class="user-role-badge">User</div>
            </div>
            <div class="user-status-display ${statusClass}">
                ${statusIcon} <span>${statusText}</span>
            </div>
        </div>
    `;
    
    return section;
}

// Create stats section showing online/away/offline counts
function createStatsSection(onlineUsers, awayUsers, totalUsers) {
    const section = document.createElement('div');
    section.className = 'status-section';
    
    const onlineCount = onlineUsers.length;
    const awayCount = awayUsers.length;
    const offlineCount = totalUsers - onlineCount - awayCount;
    
    section.innerHTML = `
        <h3 class="status-section-title">User Stats</h3>
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
    
    return section;
}

// Create list of all users (filtered by search if needed)
function createUsersSection(searchTerm, onlineUsers, awayUsers) {
    const section = document.createElement('div');
    section.className = 'status-section';
    
    // Set section title based on search
    section.innerHTML = `
        <h3 class="status-section-title">
            ${searchTerm ? `Users matching "${searchTerm}"` : 'All Users'}
        </h3>
    `;
    
    // Filter and sort users
    let users = window.allUsers
        .filter(user => {
            // Filter out current user and apply search term
            return user.name !== currentUserName && 
                   (!searchTerm || user.name.toLowerCase().includes(searchTerm));
        })
        .sort((a, b) => {
            // Sort by status: online first, then away, then offline
            const aId = a.id ? a.id.toString() : '';
            const bId = b.id ? b.id.toString() : '';
            
            const aIsOnline = onlineUsers.includes(aId);
            const bIsOnline = onlineUsers.includes(bId);
            const aIsAway = awayUsers.includes(aId);
            const bIsAway = awayUsers.includes(bId);
            
            if (aIsOnline && !bIsOnline) return -1;
            if (!aIsOnline && bIsOnline) return 1;
            if (aIsAway && !bIsAway) return -1;
            if (!aIsAway && bIsAway) return 1;
            
            // Same status, sort alphabetically
            return a.name.localeCompare(b.name);
        });
    
    // Create users list
    const usersContainer = document.createElement('div');
    usersContainer.className = 'users-list-container';
    
    // Show message if no users found
    if (users.length === 0) {
        usersContainer.innerHTML = `
            <div class="no-users-found">
                <i class="fas fa-user-slash"></i>
                <p>No users found${searchTerm ? ` matching "${searchTerm}"` : ''}</p>
            </div>
        `;
        section.appendChild(usersContainer);
        return section;
    }
    
    // Add each user
    users.forEach(user => {
        const userId = user.id ? user.id.toString() : '';
        const isOnline = onlineUsers.includes(userId);
        const isAway = awayUsers.includes(userId);
        
        // Create user element
        const userElement = document.createElement('div');
        userElement.className = 'user-status';
        
        // Add status class for styling
        if (isOnline) userElement.classList.add('online');
        else if (isAway) userElement.classList.add('away');
        
        // Set status text and icon
        let statusText = 'Offline';
        let statusClass = 'offline';
        let statusIcon = '<i class="fas fa-circle-xmark offline-icon"></i>';
        let lastSeenInfo = '';
        
        if (isOnline) {
            statusText = 'Available';
            statusClass = 'online';
            statusIcon = '<i class="fas fa-circle-check online-icon"></i>';
        } else if (isAway) {
            statusText = 'Away';
            statusClass = 'away';
            statusIcon = '<i class="fas fa-clock away-icon"></i>';
        } else {
            // Show last seen for offline users
            const userLogout = window.userLogoutTimes && 
                               window.userLogoutTimes.find(logout => logout.name === user.name);
                               
            if (userLogout && userLogout.last_logout) {
                const logoutDate = new Date(userLogout.last_logout);
                lastSeenInfo = `<div class="last-seen">Last seen: ${formatTimestamp(logoutDate)}</div>`;
            }
        }
        
        // Set user element content
        userElement.innerHTML = `
            <div class="user-info">
                <span class="user-name">${user.name}</span>
                ${lastSeenInfo}
            </div>
            <div class="status ${statusClass}">
                ${statusIcon} <span class="status-text">${statusText}</span>
            </div>
            <button class="message-user-btn" title="Message ${user.name}" data-username="${user.name}">
                <i class="fas fa-paper-plane"></i>
            </button>
        `;
        
        // Add message button event
        const messageBtn = userElement.querySelector('.message-user-btn');
        messageBtn.addEventListener('click', () => {
            window.location.href = `DMs.html?user=${encodeURIComponent(user.name)}`;
        });
        
        // Add to container
        usersContainer.appendChild(userElement);
    });
    
    section.appendChild(usersContainer);
    return section;
}

// Format timestamp for last seen
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

// Monitor user activity to update status
function setupActivityMonitoring() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const INACTIVITY_TIME = 30000; // 30 seconds before away status
    
    let lastActivityTime = Date.now();
    let isAway = false;
    
    // Handle user activity
    function handleUserActivity() {
        const now = Date.now();
        
        // If user was away, set them back to online
        if (isAway) {
            socket.emit('userOnline', currentUserId);
            isAway = false;
        }
        
        // Update last activity time
        lastActivityTime = now;
    }
    
    // Add event listeners
    activityEvents.forEach(event => {
        document.addEventListener(event, handleUserActivity);
    });
    
    // Set up periodic check
    const inactivityChecker = setInterval(() => {
        const now = Date.now();
        
        // If user inactive for threshold and not already away
        if (!isAway && (now - lastActivityTime > INACTIVITY_TIME)) {
            socket.emit('userAway', currentUserId);
            isAway = true;
        }
    }, 5000);
    
    // Ensure initial online status is sent
    if (currentUserId) {
        socket.emit('userOnline', currentUserId);
    }
    
    // Clean up
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

// Function for admin to delete global messages
function deleteGlobalMessage(messageId, messageElement) {
    fetch('/remove-global-message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId: messageId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const messageText = messageElement.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = 'Removed by Moderator';
                messageText.classList.add('removed-message');
            }
            
            // Add visual indication that a moderator removed this message
            const moderatorFlag = document.createElement('div');
            moderatorFlag.className = 'moderator-flag';
            moderatorFlag.innerHTML = '<i class="fas fa-shield-alt"></i> Moderated';
            
            // Check if the flag is already there to avoid duplicates
            if (!messageElement.querySelector('.moderator-flag')) {
                messageElement.querySelector('.message-content').appendChild(moderatorFlag);
            }
            
            // Remove any action buttons
            const buttons = messageElement.querySelectorAll('button');
            buttons.forEach(button => {
                if (button.classList.contains('quote-btn') || button.classList.contains('delete-btn')) {
                    button.remove();
                }
            });
            
            showToast('Message removed successfully', 'success');
        } else {
            showToast('Failed to remove message: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Failed to remove message', 'error');
    });
}

// Add styles for the delete button and removed messages if they don't exist
const deleteButtonStyle = document.createElement('style');
deleteButtonStyle.textContent = `
    .message-content {
        position: relative;
    }
    
    .delete-btn {
        position: absolute;
        right: -40px;
        top: calc(50% - 20px);
        opacity: 0;
        transition: all 0.3s ease;
        background: rgba(177, 68, 60, 0.8);
        border: none;
        color: #fff;
        cursor: pointer;
        padding: 6px;
        font-size: 0.9em;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
    }
    
    .message:hover .delete-btn {
        opacity: 1;
        right: -35px;
    }
    
    .quote-btn {
        position: absolute;
        right: -40px;
        top: calc(50% + 15px);
    }
    
    .message:hover .quote-btn {
        right: -35px;
    }
    
    .delete-btn:hover {
        background: #b1443c;
        color: #fff;
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .removed-message {
        font-style: italic;
        color: #888;
        text-decoration: line-through;
        opacity: 0.7;
    }
`;
document.head.appendChild(deleteButtonStyle);

// Function to check if a message has already been moderated
function isMessageModerated(messageElement) {
    const messageText = messageElement.querySelector('.message-text');
    if (!messageText) return false;
    
    return messageText.textContent === 'Removed by Moderator' || 
           messageText.textContent === 'Removed by Admin' ||
           messageText.classList.contains('removed-message');
}