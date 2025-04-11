import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
window.onload = () => {
    document.body.classList.add("chat-open");
  };

// Get the current origin for secure messaging
const TRUSTED_ORIGIN = window.location.origin;

// For production, the API key should be moved to server-side
// This is a temporary solution until server routes are implemented
const genAI = new GoogleGenerativeAI("AIzaSyA2lh7h5O4-TjMu6wJXwCTP6KlTNvSBRjo");
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

let messages = {
    history: [],
}
function extractBodyContent(htmlString) {
  // Find the start of <body>
  const bodyStart = htmlString.indexOf('<body>');
  // Find the end of </body>
  const bodyEnd = htmlString.indexOf('</body>') + '</body>'.length;
  
  // If both tags are found, extract the content between them
  if (bodyStart !== -1 && bodyEnd !== -1) {
    return htmlString.slice(bodyStart, bodyEnd);
  }
  
  // If not found, return the original string or handle as needed
  return htmlString;
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
      prompt = `Can you explain  whether I am wrong or right to me and why and send the answer back in html format :\n\n${userMessage}`;
      break;
    default:
      prompt = "Unsupported task selected.";
  }

  try {
    // Continue using direct API call to maintain current functionality
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    console.log(extractBodyContent(response))
    document.querySelector(".chat-window .chat .loader").remove();

    document.querySelector(".chat-window .chat").insertAdjacentHTML("beforeend", `
      <div class="model">
        ${extractBodyContent(response)}
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
  // If in an iframe, send message to parent with proper origin
  if (window.parent !== window) {
    window.parent.postMessage({ action: 'closeChat' }, TRUSTED_ORIGIN);
  }
});

// Handle parent window messages with origin validation
window.addEventListener('message', (event) => {
  // Verify the origin of the message for security
  if (event.origin !== TRUSTED_ORIGIN) {
    console.error('Received message from untrusted origin:', event.origin);
    return;
  }
  
  const data = event.data;
  if (data.action === 'openChat') {
    document.body.classList.add("chat-open");
  }
});

console.log("AI Chat Assistant loaded");

// For backward compatibility if direct API calls are needed temporarily
// This will be removed in production and is just for testing during transition
async function legacyDirectApiCall(prompt) {
  try {
    const response = await fetch('/api/generate-content-legacy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt })
    });
    return await response.json();
  } catch (error) {
    console.error("Legacy API call failed:", error);
    return { error: "API call failed" };
  }
}