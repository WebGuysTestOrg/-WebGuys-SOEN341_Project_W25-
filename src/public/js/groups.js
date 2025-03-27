let loggedInUserId = null;
let loggedInUserName = "";
const socket = io();

// Back button functionality
document.getElementById("back-btn").addEventListener("click", () => {
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            window.location.href = data.role === "admin" ? "/admin_page.html" : "/user_page.html";
        })
        .catch(() => window.location.href = "/user_page.html");
});

// Fetch logged-in user info
fetch('/user-info')
    .then(response => response.json())
    .then(data => {
        loggedInUserId = data.id;
        loggedInUserName = data.name;
        fetchGroups();
    })
    .catch(() => window.location.href = '/login_form.html');

// Fetch user's groups
function fetchGroups() {
    fetch('/get-user-groups')
        .then(response => response.json())
        .then(groups => {
            const groupList = document.getElementById("group-list");
            groupList.innerHTML = "";

            groups.forEach(group => {
                const listItem = document.createElement("li");
                listItem.textContent = group.name;
                listItem.addEventListener("click", () => showGroupDetails(group));
                groupList.appendChild(listItem);
            });
        })
        .catch(err => console.error("Error fetching groups:", err));
}

// Create new group
document.getElementById("create-group-btn").addEventListener("click", () => {
    const groupName = prompt("Enter group name:");
    if (!groupName) return;

    fetch('/create-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                fetchGroups();
            }
        })
        .catch(err => console.error("Error creating group:", err));
});

// Show group details and chat
function showGroupDetails(group) {
    const groupDetails = document.getElementById("group-details");
    const groupActions = document.getElementById("group-actions");
    const groupChat = document.getElementById("group-chat");

    groupDetails.innerHTML = `
        <h2>${group.name}</h2>
        <p>Members: ${group.members.join(", ")}</p>
    `;

    groupActions.innerHTML = `
        <button onclick="showGroupChat(${group.id})">Open Chat</button>
        <button onclick="leaveGroup(${group.id})">Leave Group</button>
    `;

    groupChat.style.display = "block";
    showGroupChat(group.id);
}

// Show group chat
function showGroupChat(groupId) {
    document.getElementById("group-chat").style.display = "block";
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = "Loading messages...";

    fetch(`/group-messages/${groupId}`)
        .then(response => response.json())
        .then(messages => {
            chatBox.innerHTML = ""; //Clear chat box

            messages.forEach((msg) => {
                const isOwnMessage = msg.sender === loggedInUserName;

                // Create message container
                const messageDiv = document.createElement("div");
                messageDiv.classList.add("message", isOwnMessage ? "my-message" : "other-message");

                // Create username element
                const usernameDiv = document.createElement("div");
                usernameDiv.classList.add("message-username");
                usernameDiv.textContent = msg.sender;

                // Create message text element
                const textDiv = document.createElement("div");
                textDiv.classList.add("message-text");
                textDiv.textContent = msg.text;

                // Append username and text to message container
                messageDiv.appendChild(usernameDiv);
                messageDiv.appendChild(textDiv);

                // Append message container to chat box
                chatBox.appendChild(messageDiv);
            });

            chatBox.scrollTop = chatBox.scrollHeight;
        });

    socket.off(`group-message-${groupId}`);

    socket.on(`group-message-${groupId}`, (message) => {
        const isOwnMessage = message.sender === loggedInUserName;

        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", isOwnMessage ? "my-message" : "other-message");

        const usernameDiv = document.createElement("div");
        usernameDiv.classList.add("message-username");
        usernameDiv.textContent = message.sender;

        const textDiv = document.createElement("div");
        textDiv.classList.add("message-text");
        textDiv.textContent = message.text;

        messageDiv.appendChild(usernameDiv);
        messageDiv.appendChild(textDiv);

        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// Send message function
window.sendMessage = function () {
    const messageText = document.getElementById("chat-message").value.trim();
    if (!messageText) return;

    socket.emit("send-message", { groupId, userId: loggedInUserId, message: messageText });

    document.getElementById("chat-message").value = "";
};

// Send message on Enter key press
const messageText = document.getElementById("chat-message");
messageText.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
}); 