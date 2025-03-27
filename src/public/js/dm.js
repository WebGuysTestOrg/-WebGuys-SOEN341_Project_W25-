const socket = io('ws://localhost:3000');
let loggedInUserId = null;
let loggedInUserName = "";
let quotedMessage = null;

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

// Socket event listeners
socket.on("private-message", (msg) => {
    if (msg.senderId == loggedInUserId || msg.recipientId == loggedInUserId) {
        displayMessage(msg, msg.senderId === loggedInUserId);
    }
});

// Message display function
function displayMessage(msg, isOwnMessage) {
    const chatMessages = document.getElementById("chat-messages");
    const messageElement = document.createElement("div");
    
    // Differentiate between own message and message from others
    messageElement.classList.add("message", isOwnMessage ? "my-message" : "other-message");
    
    // Create div for username
    const usernameElement = document.createElement("div");
    usernameElement.classList.add("message-username");
    usernameElement.textContent = isOwnMessage ? "" : msg.senderName;

    if (msg.quoted) {
        const quotedElement = document.createElement("div");
        quotedElement.classList.add("quoted-message");
        quotedElement.textContent = `Replied to: "${msg.quoted.text}"`;
        messageElement.appendChild(quotedElement);
    }

    // Create div for text element of message
    const textElement = document.createElement("div");
    textElement.classList.add("message-text");
    textElement.textContent = msg.text;

    messageElement.appendChild(usernameElement);
    messageElement.appendChild(textElement);

    if(!isOwnMessage){
        const quoteButton = document.createElement("button");
        quoteButton.textContent = "Reply";
        quoteButton.classList.add("quote-btn");
        quoteButton.onclick = () => quoteMessage(msg.id, msg.text);
        messageElement.appendChild(quoteButton);
    }
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Quote message functionality
function quoteMessage(msgId, messageText) {
    quotedMessage = { id: msgId, text: messageText };

    const quoteContainer = document.getElementById('quoted-message-container');
    const quotedText = document.getElementById('quoted-text');

    quotedText.textContent = `Replying to: "${messageText}"`;
    quoteContainer.style.display = 'block';
}

// Cancel quoting
document.getElementById('cancel-quote').addEventListener('click', () => {
    quotedMessage = null;
    document.getElementById('quoted-message-container').style.display = 'none';
}); 