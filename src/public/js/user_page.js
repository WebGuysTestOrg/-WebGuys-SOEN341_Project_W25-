const socket = io();
let messages = [];
let loggedInUserId = null;
let loggedInUserName = "";

// Fetch user info
fetch('/user-info')
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        loggedInUserId = data.id;
        loggedInUserName = data.name;
        document.getElementById('username').textContent = data.name;
        fetchTeamsWithMembers();
    })
    .catch(() => window.location.href = '/login_form.html');

// Create channel form submission
document.getElementById('createChannelForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const teamId = document.getElementById('teamId').value;
    const channelName = document.getElementById('channelName').value;

    if (!teamId || !channelName) {
        alert("Please provide both Team ID and Channel Name.");
        return;
    }

    fetch('/create-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, channelName }),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert("Channel created successfully!");
                fetchTeamsWithMembers();
            }
        })
        .catch(err => console.error('Error:', err));
});

// Assign user to channel form submission
document.getElementById('assignUserForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const teamId = document.getElementById('teamIdAssign').value;
    const channelName = document.getElementById('channelNameAssign').value;
    const userName = document.getElementById('userNameAssign').value;

    if (!teamId || !channelName || !userName) {
        alert("Please provide all required fields.");
        return;
    }

    fetch('/assign-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, channelName, userName }),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert("User assigned successfully!");
                fetchTeamsWithMembers();
            }
        })
        .catch(err => console.error('Error:', err));
});

// Fetch teams with members
function fetchTeamsWithMembers() {
    fetch('/get-teams-with-members')
        .then(response => response.json())
        .then(teams => {
            const teamsContainer = document.getElementById('teams-container');
            teamsContainer.innerHTML = '';

            if (teams.length === 0) {
                teamsContainer.innerHTML = '<p>No teams available.</p>';
                return;
            }

            teams.forEach(team => {
                console.log("Processing team:", team);

                const teamDiv = document.createElement('div');
                teamDiv.classList.add('team-card');
                
                const teamsButton = document.createElement("button");
                teamsButton.textContent = "Open Chat";
                teamsButton.classList.add("teamsButton");

                const teamTitle = document.createElement('h3');
                teamTitle.innerHTML = `(${team.teamId || 'N/A'}) ${team.teamName || 'Unnamed Team'}`;
                teamTitle.style.color = '#007BFF';

                const createdBy = document.createElement('p');
                createdBy.innerHTML = `<strong>Created by:</strong> ${team.creatorName || 'Unknown'}`;

                const membersList = document.createElement('p');
                membersList.innerHTML = `<strong>Members:</strong> ${team.members?.join(', ') || 'No members'}`;
                
                const channelContainer = document.createElement('div');
                channelContainer.classList.add('channel-container');

                Object.values(team.channels).forEach(channel => {
                    const channelDiv = document.createElement('div');
                    channelDiv.style.marginLeft = '20px';

                    const channelName = document.createElement('h4');
                    channelName.textContent = `Channel: ${channel.channelName}`;
                    channelName.style.color = '#555';
                    
                    const channelMembersList = document.createElement('p');
                    if (channel.members && channel.members.length > 0) {
                        channelMembersList.innerHTML = `<strong>Members:</strong> ${channel.members.join(', ')}`;
                    } else {
                        channelMembersList.innerHTML = `<strong>Members:</strong> No members`;
                    }

                    channelDiv.appendChild(channelName);
                    channelDiv.appendChild(channelMembersList);
                    channelContainer.appendChild(channelDiv);
                });

                teamDiv.appendChild(teamTitle);
                teamDiv.appendChild(createdBy);
                teamDiv.appendChild(membersList);
                teamDiv.appendChild(channelContainer);
                teamDiv.appendChild(teamsButton);

                teamsButton.addEventListener("click", function(){
                    window.location.href = `teams_chat.html?team=${encodeURIComponent(team.teamName)}`;
                });

                teamsContainer.appendChild(teamDiv);
            });
        })
        .catch(err => console.error('Error fetching teams:', err));
}

// Message handling functions
function addMessage(sender, text, senderID) {
    const newMessage = {
        id: messages.length + 1,
        text: text,
        sender: sender,
        senderID: senderID,
        timestamp: Date.now()
    };

    messages.push(newMessage);
    sessionStorage.setItem("chatMessages", JSON.stringify(messages));
}

function sendMessage() {
    const input = document.getElementById("message");
    if (input.value) {
        socket.emit('message', { text: input.value });
    }
    input.focus();
}

// Socket event listeners
socket.on("message", (msg) => {
    const messageElement = document.createElement("div");
    if (loggedInUserId === msg.userID) {
        messageElement.classList.add("my-message");
        messageElement.textContent = `${msg.text}`;
        addMessage(msg.user, msg.text, msg.userID);
        sessionStorage.setItem("chatMessages", JSON.stringify(messages));
    } else {
        messageElement.classList.add("other-message");
        messageElement.textContent = `${msg.user}: ${msg.text}`;
        addMessage(msg.user, msg.text, msg.userID);
        sessionStorage.setItem("chatMessages", JSON.stringify(messages));
    }
    console.log("SavedMessages", messages);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    messageInput.value = "";
});

// Emoji picker functionality
document.getElementById("emoji-btn").addEventListener("click", function (event) {
    console.log("Emoji Clicked");
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