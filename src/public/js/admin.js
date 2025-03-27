// Socket.io connection
const socket = io();
let messages = [];
let loggedInUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin page loaded, verifying session...');
    
    // First verify session
    fetch('/user-info', {
        credentials: 'include',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => {
        console.log('Session verification response status:', response.status);
        if (!response.ok) {
            throw new Error(`Session invalid: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Session verification data:', data);
        if (!data || !data.id) {
            throw new Error('Invalid user data received');
        }
        if (data.user_type !== 'admin') {
            throw new Error('User is not an admin');
        }
        document.getElementById('adminName').textContent = data.name;
        loggedInUserId = data.id;
        initializeSocket(data);
    })
    .catch(error => {
        console.error('Session verification error:', error);
        // Only redirect if it's a session error, not a network error
        if (error.message.includes('Session invalid') || error.message.includes('Invalid user data')) {
            window.location.href = '/login_form.html?reason=session_expired';
        } else {
            console.error('Non-session error:', error);
            // Don't redirect on network errors
        }
    });

    // Initialize logout button
    document.getElementById('logoutButton').addEventListener('click', () => {
        console.log('Logout button clicked');
        fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        })
        .then(response => {
            console.log('Logout response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Logout successful, redirecting to:', data.redirect);
            window.location.href = data.redirect;
        })
        .catch(error => {
            console.error('Logout error:', error);
            window.location.href = '/login_form.html';
        });
    });
});

function initializeSocket(userData) {
    const socket = io({
        withCredentials: true,
        auth: {
            userId: userData.id,
            userName: userData.name
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        // Connection established
    });

    socket.on('disconnect', (reason) => {
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
    const messageInput = document.getElementById('message');
    const text = messageInput.value.trim();
    
    if (!text) return;
    
    socket.emit('message', { text });
    messageInput.value = '';
}

// Socket event listeners
socket.on("message", (msg) => {
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
    messageInput.value = "";
});

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