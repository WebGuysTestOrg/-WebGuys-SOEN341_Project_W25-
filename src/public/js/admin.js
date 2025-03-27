// Socket.io connection
const socket = io();
let messages = [];
let loggedInUserId = null;

// Check authentication
fetch('/check-auth')
    .then(response => response.json())
    .then(data => {
        if (data.authenticated && data.userType === 'admin') {
            loggedInUserId = data.userId;
            document.getElementById('admin-name').textContent = data.name;
        } else {
            window.location.href = '/login_form.html';
        }
    })
    .catch(() => window.location.href = '/login_form.html');

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