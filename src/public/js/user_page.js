// Global variables
let socket = null;
let messages = [];
let loggedInUserId = null;
let loggedInUserName = "";

// Initialize socket connection
function initializeSocket() {
    if (socket) {
        socket.disconnect();
    }

    socket = io({
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Socket connected');
        if (loggedInUserId) {
            socket.emit('userOnline', loggedInUserId);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });

    // Message handling
    socket.on("message", handleNewMessage);
}

// Message handling functions
function handleNewMessage(msg) {
    const messageElement = document.createElement("div");
    if (loggedInUserId === msg.userID) {
        messageElement.classList.add("my-message");
        messageElement.textContent = `${msg.text}`;
    } else {
        messageElement.classList.add("other-message");
        messageElement.textContent = `${msg.user}: ${msg.text}`;
    }
    
    addMessage(msg.user, msg.text, msg.userID);
    sessionStorage.setItem("chatMessages", JSON.stringify(messages));
    
    const chatMessages = document.getElementById("chatMessages");
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const messageInput = document.getElementById("message");
    messageInput.value = "";
}

function addMessage(sender, text, senderID) {
    const newMessage = {
        id: messages.length + 1,
        text: text,
        sender: sender,
        senderID: senderID,
        timestamp: Date.now()
    };
    messages.push(newMessage);
}

function sendMessage() {
    const input = document.getElementById("message");
    if (input.value && socket) {
        socket.emit('message', { text: input.value });
    }
    input.focus();
}

// Emoji picker functionality
function initializeEmojiPicker() {
    const emojiBtn = document.getElementById("emoji-btn");
    const pickerContainer = document.getElementById("emoji-picker-container");

    emojiBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (pickerContainer.style.display === "none" || pickerContainer.innerHTML === "") {
            pickerContainer.style.display = "block";
            pickerContainer.innerHTML = "";

            const picker = new EmojiMart.Picker({
                set: 'apple',
                onEmojiSelect: (emoji) => {
                    const messageInput = document.getElementById("message");
                    messageInput.value += emoji.native || emoji.colons || emoji.id;
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
        if (
            pickerContainer.style.display === "block" &&
            !pickerContainer.contains(event.target) &&
            event.target !== emojiBtn
        ) {
            pickerContainer.style.display = "none";
        }
    });
}

// Form submission handlers
function initializeForms() {
    // Create channel form
    document.getElementById('createChannelForm').addEventListener('submit', handleCreateChannel);
    
    // Assign user form
    document.getElementById('assignUserForm').addEventListener('submit', handleAssignUser);
}

async function handleCreateChannel(e) {
    e.preventDefault();
    const teamId = document.getElementById('teamId').value;
    const channelName = document.getElementById('channelName').value;

    if (!teamId || !channelName) {
        alert("Please provide both Team ID and Channel Name.");
        return;
    }

    try {
        const response = await fetch('/create-channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ teamId, channelName }),
        });
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
        } else {
            alert("Channel created successfully!");
            fetchTeamsWithMembers();
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

async function handleAssignUser(e) {
    e.preventDefault();
    const teamId = document.getElementById('teamIdAssign').value;
    const channelName = document.getElementById('channelNameAssign').value;
    const userName = document.getElementById('userNameAssign').value;

    if (!teamId || !channelName || !userName) {
        alert("Please provide all required fields.");
        return;
    }

    try {
        const response = await fetch('/assign-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ teamId, channelName, userName }),
        });
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
        } else {
            alert("User assigned successfully!");
            fetchTeamsWithMembers();
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

// Team fetching and display
async function fetchTeamsWithMembers() {
    try {
        const response = await fetch('/get-teams-with-members', {
            credentials: 'include'
        });
        const teams = await response.json();
        displayTeams(teams);
    } catch (err) {
        console.error('Error fetching teams:', err);
    }
}

function displayTeams(teams) {
    const teamsContainer = document.getElementById('teams-container');
    teamsContainer.innerHTML = '';

    if (teams.length === 0) {
        teamsContainer.innerHTML = '<p>No teams available.</p>';
        return;
    }

    teams.forEach(team => {
        const teamDiv = createTeamElement(team);
        teamsContainer.appendChild(teamDiv);
    });
}

function createTeamElement(team) {
    const teamDiv = document.createElement('div');
    teamDiv.classList.add('team-card');
    
    const teamsButton = document.createElement("button");
    teamsButton.textContent = "Open Chat";
    teamsButton.classList.add("teamsButton");
    teamsButton.addEventListener("click", () => {
        window.location.href = `teams_chat.html?team=${encodeURIComponent(team.teamName)}`;
    });

    const teamTitle = document.createElement('h3');
    teamTitle.innerHTML = `(${team.teamId || 'N/A'}) ${team.teamName || 'Unnamed Team'}`;
    teamTitle.style.color = '#007BFF';

    const createdBy = document.createElement('p');
    createdBy.innerHTML = `<strong>Created by:</strong> ${team.creatorName || 'Unknown'}`;

    const membersList = document.createElement('p');
    membersList.innerHTML = `<strong>Members:</strong> ${team.members?.join(', ') || 'No members'}`;
    
    const channelContainer = createChannelContainer(team.channels);

    teamDiv.appendChild(teamTitle);
    teamDiv.appendChild(createdBy);
    teamDiv.appendChild(membersList);
    teamDiv.appendChild(channelContainer);
    teamDiv.appendChild(teamsButton);

    return teamDiv;
}

function createChannelContainer(channels) {
    const channelContainer = document.createElement('div');
    channelContainer.classList.add('channel-container');

    Object.values(channels).forEach(channel => {
        const channelDiv = document.createElement('div');
        channelDiv.style.marginLeft = '20px';

        const channelName = document.createElement('h4');
        channelName.textContent = `Channel: ${channel.channelName}`;
        channelName.style.color = '#555';
        
        const channelMembersList = document.createElement('p');
        channelMembersList.innerHTML = `<strong>Members:</strong> ${channel.members?.join(', ') || 'No members'}`;

        channelDiv.appendChild(channelName);
        channelDiv.appendChild(channelMembersList);
        channelContainer.appendChild(channelDiv);
    });

    return channelContainer;
}

// Initialize application
async function initializeApp() {
    try {
        const response = await fetch('/user-info', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Unauthorized');
        }
        
        const data = await response.json();
        loggedInUserId = data.id;
        loggedInUserName = data.name;
        document.getElementById('username').textContent = data.name;
        
        initializeSocket();
        initializeForms();
        initializeEmojiPicker();
        fetchTeamsWithMembers();
    } catch (error) {
        console.error('Error initializing app:', error);
        window.location.href = '/login_form.html';
    }
}

// Start the application
initializeApp(); 