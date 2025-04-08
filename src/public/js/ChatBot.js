import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
window.onload = () => {
    document.body.classList.add("chat-open");
  };

const API_KEY = "AIzaSyA2lh7h5O4-TjMu6wJXwCTP6KlTNvSBRjo";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

let messages = {
    history: [],
}

async function sendMessage() {
  const input = document.querySelector(".chat-window input");
  const userMessage = input.value.trim();
  const selectedTask = document.getElementById("task-select").value;

  if (!userMessage) return;

  input.value = "";

  document.querySelector(".chat-window .chat").insertAdjacentHTML("beforeend", `
    <div class="user">
      <p><strong>${selectedTask.toUpperCase()}:</strong> ${userMessage}</p>
    </div>
  `);

  document.querySelector(".chat-window .chat").insertAdjacentHTML("beforeend", `
    <div class="loader"></div>
  `);

  let prompt = "";

  switch (selectedTask) {
    case "paraphrase":
      prompt = `Please paraphrase the following text to make it sound more natural:\n\n${userMessage}`;
      break;
    case "check grammar":
      prompt = `Please check the grammar and make the pargraph better:\n\n${userMessage}`;
      break;
    case "fact check":
      prompt = `Please fact-check the following claim and provide a brief explanation:\n\n${userMessage}`;
      break;
    default:
      prompt = "Unsupported task selected.";
  }

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    document.querySelector(".chat-window .chat .loader").remove();

    document.querySelector(".chat-window .chat").insertAdjacentHTML("beforeend", `
      <div class="model">
        <p>${response}</p>
      </div>
    `);

    const chatContainer = document.querySelector(".chat-window .chat");
    chatContainer.scrollTop = chatContainer.scrollHeight;

  } catch (error) {
    console.error(error);
    document.querySelector(".chat-window .chat .loader").remove();
    document.querySelector(".chat-window .chat").insertAdjacentHTML("beforeend", `
      <div class="error">
        <p>The message could not be sent. Please try again.</p>
      </div>
    `);
  }
}


// Send message when button is clicked
document.querySelector(".chat-window .input-area button")
.addEventListener("click", ()=>sendMessage());

// Send message when Enter key is pressed
document.querySelector(".chat-window input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Close button functionality
document.getElementById("close-chat").addEventListener("click", () => {
  document.body.classList.remove("chat-open");
  // If in an iframe, send message to parent
  if (window.parent !== window) {
    window.parent.postMessage({ action: 'closeChat' }, '*');
  }
});

// Handle parent window messages
window.addEventListener('message', (event) => {
  const data = event.data;
  if (data.action === 'openChat') {
    document.body.classList.add("chat-open");
  }
});

console.log("AI Chat Assistant loaded");