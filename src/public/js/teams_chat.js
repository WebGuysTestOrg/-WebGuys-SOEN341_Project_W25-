const socket = io('ws://localhost:3000');
const params = new URLSearchParams(window.location.search);
const teamName = params.get("team");
let channelClicked = "";
let currentUser = "";
let currentUserRole = "";
let quotedMessage = null;

// Emoji picker functionality
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

// Quote message functionality
function quoteMessage(msgId, messageText) {
    quotedMessage = messageText;

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