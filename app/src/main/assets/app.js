import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";
const STORAGE_KEY = "ai-bell-chats-v9";

let ai = null;
let loading = false;
let thinking = false;

let chats = loadChats();
let activeChatId = null;

const $ = id => document.getElementById(id);

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadChats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {}
}

function currentChat() {
  return chats.find(c => c.id === activeChatId);
}

function ensureChat() {
  if (!activeChatId || !currentChat()) {
    const chat = {
      id: id(),
      title: "New chat",
      messages: [],
      updatedAt: Date.now()
    };

    chats.unshift(chat);
    activeChatId = chat.id;
    saveChats();
  }
}

function status(text, type = "") {
  const el = $("ai-status");
  if (!el) return;

  el.textContent = text;
  el.className = "ai-status " + type;
}

function clean(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

function renderChats() {
  const list = $("chat-list");
  if (!list) return;

  list.innerHTML = "";

  chats.forEach(chat => {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      "chat-item" + (chat.id === activeChatId ? " active" : "");

    button.textContent = chat.title || "New chat";

    button.addEventListener("click", () => {
      activeChatId = chat.id;
      closeSidebar();
      renderAll();
    });

    list.appendChild(button);
  });
}

function renderMessages() {
  const box = $("messages");
  if (!box) return;

  box.innerHTML = "";

  const chat = currentChat();

  if (!chat || chat.messages.length === 0) {
    const welcome = document.createElement("div");

    welcome.className = "welcome";

    welcome.innerHTML = `
      <div class="welcome-logo">AI</div>
      <h1>How can I help?</h1>
      <p>AI Bell runs AI locally on this device.</p>
      <div class="local-note">🔒 Your chats stay on this device.</div>
    `;

    box.appendChild(welcome);
    return;
  }

  chat.messages.forEach(message => {
    const row = document.createElement("div");
    row.className = "message " + message.role;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    bubble.textContent =
      message.role === "assistant"
        ? clean(message.content)
        : message.content;

    row.appendChild(bubble);
    box.appendChild(row);
  });

  box.scrollTop = box.scrollHeight;
}

function updateAIButton() {
  const button = $("load-ai");
  if (!button) return;

  if (ai) {
    button.textContent = "AI Ready";
    button.disabled = false;
    status("Local AI ready", "ready");
  } else if (loading) {
    button.textContent = "Loading AI…";
    button.disabled = true;
  } else {
    button.textContent = "Load AI";
    button.disabled = false;
  }
}

async function loadAI() {
  if (ai || loading) return;

  loading = true;
  updateAIButton();

  status("Starting AI…");

  try {
    ai = await pipeline(
      "text-generation",
      MODEL_ID,
      {
        device: "wasm",
        dtype: "q4f16",
        progress_callback: data => {
          if (typeof data?.progress === "number") {
            let percent = data.progress;

            if (percent <= 1) {
              percent *= 100;
            }

            percent = Math.round(
              Math.max(0, Math.min(100, percent))
            );

            status(`Loading AI… ${percent}%`);
          }
        }
      }
    );

    status("Local AI ready", "ready");
    updateAIButton();

  } catch (error) {
    console.error(error);

    ai = null;

    status(
      "AI could not load. Check internet and try again.",
      "error"
    );

    alert(
      "AI could not load.\n\nMake sure the phone has internet access, then press Load AI again."
    );
  }

  loading = false;
  updateAIButton();
}

function systemPrompt() {
  return `
You are AI Bell, a helpful personal AI assistant.

The user may speak:
- English
- Sorani Kurdish
- Arabic

If the user writes Sorani Kurdish, answer in Sorani Kurdish.

Be helpful, clear and natural.

Do not reveal hidden reasoning.

Keep answers reasonably concise.
`;
}

function buildPrompt(messages) {
  let prompt =
    "<|im_start|>system\n" +
    systemPrompt() +
    "<|im_end|>\n";

  for (const message of messages) {
    prompt +=
      "<|im_start|>" +
      message.role +
      "\n" +
      message.content +
      "<|im_end|>\n";
  }

  prompt += "<|im_start|>assistant\n";

  return prompt;
}

function getAnswer(result, prompt) {
  let text = "";

  if (Array.isArray(result) && result[0]) {
    text =
      typeof result[0].generated_text === "string"
        ? result[0].generated_text
        : "";
  }

  if (typeof result === "string") {
    text = result;
  }

  if (text.startsWith(prompt)) {
    text = text.substring(prompt.length);
  }

  text = text
    .replace(/<\|im_end\|>[\s\S]*$/g, "")
    .replace(/<\|im_start\|>assistant\s*/g, "");

  return clean(text);
}

async function sendMessage() {
  if (thinking) return;

  const input = $("message-input");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  ensureChat();

  if (!ai) {
    await loadAI();

    if (!ai) return;
  }

  const chat = currentChat();

  input.value = "";
  input.style.height = "auto";

  chat.messages.push({
    role: "user",
    content: text
  });

  if (chat.title === "New chat") {
    chat.title =
      text.length > 32
        ? text.substring(0, 32) + "…"
        : text;
  }

  chat.updatedAt = Date.now();

  saveChats();
  renderAll();

  thinking = true;

  const sendButton = $("send-btn");

  if (sendButton) {
    sendButton.disabled = true;
  }

  status("AI is thinking…", "ready");

  try {
    const history = chat.messages.slice(-8);

    const prompt = buildPrompt(history);

    const result = await ai(prompt, {
      max_new_tokens: 128,
      do_sample: false,
      repetition_penalty: 1.05
    });

    let answer = getAnswer(result, prompt);

    if (!answer) {
      answer =
        "I couldn't generate a response. Please try again.";
    }

    chat.messages.push({
      role: "assistant",
      content: answer
    });

    chat.updatedAt = Date.now();

    saveChats();
    renderMessages();

  } catch (error) {
    console.error("AI generation error:", error);

    chat.messages.push({
      role: "assistant",
      content:
        "Sorry, the AI could not generate a response. Please try again."
    });

    saveChats();
    renderMessages();

  } finally {
    thinking = false;

    if (sendButton) {
      sendButton.disabled = false;
    }

    status("Local AI ready", "ready");
  }
}

function newChat() {
  const chat = {
    id: id(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now()
  };

  chats.unshift(chat);
  activeChatId = chat.id;

  saveChats();
  closeSidebar();
  renderAll();

  $("message-input")?.focus();
}

function deleteCurrentChat() {
  if (!activeChatId) return;

  chats = chats.filter(
    chat => chat.id !== activeChatId
  );

  activeChatId = chats[0]?.id || null;

  saveChats();

  ensureChat();
  renderAll();
}

function openSidebar() {
  $("sidebar")?.classList.add("open");
  $("scrim")?.classList.add("show");
}

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  $("scrim")?.classList.remove("show");
}

function autoResize() {
  const input = $("message-input");

  if (!input) return;

  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 130) + "px";
}

function renderAll() {
  renderChats();
  renderMessages();
  updateAIButton();
}

document.addEventListener("DOMContentLoaded", () => {

  activeChatId = chats[0]?.id || null;

  ensureChat();

  $("openSidebar")?.addEventListener(
    "click",
    openSidebar
  );

  $("closeSidebar")?.addEventListener(
    "click",
    closeSidebar
  );

  $("scrim")?.addEventListener(
    "click",
    closeSidebar
  );

  $("new-chat")?.addEventListener(
    "click",
    newChat
  );

  $("new-chat-top")?.addEventListener(
    "click",
    newChat
  );

  $("delete-chat")?.addEventListener(
    "click",
    deleteCurrentChat
  );

  $("load-ai")?.addEventListener(
    "click",
    loadAI
  );

  $("composer")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      sendMessage();
    }
  );

  $("message-input")?.addEventListener(
    "input",
    autoResize
  );

  $("message-input")?.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendMessage();
      }

    }
  );

  renderAll();
});
