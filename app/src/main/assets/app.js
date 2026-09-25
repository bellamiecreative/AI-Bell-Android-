import { pipeline } from
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";

let generator = null;
let loading = false;
let thinking = false;

const $ = id => document.getElementById(id);

function status(text) {
  const el = $("ai-status");
  if (el) el.textContent = text;
}

async function loadAI() {
  if (generator || loading) return;

  loading = true;
  status("Loading AI...");

  try {
    generator = await pipeline(
      "text-generation",
      MODEL_ID,
      {
        device: "wasm",
        dtype: "q8"
      }
    );

    status("AI Ready");
    $("load-ai").textContent = "AI Ready";

  } catch (error) {
    console.error(error);
    generator = null;
    status("AI failed to load");
    alert("AI could not load. Check your internet connection.");
  }

  loading = false;
}

async function sendMessage() {
  if (thinking) return;

  const input = $("message-input");
  const messages = $("messages");

  const text = input.value.trim();
  if (!text) return;

  if (!generator) {
    await loadAI();
    if (!generator) return;
  }

  thinking = true;
  input.value = "";

  const userMessage = document.createElement("div");
  userMessage.className = "message user";

  const userBubble = document.createElement("div");
  userBubble.className = "bubble";
  userBubble.textContent = text;

  userMessage.appendChild(userBubble);
  messages.appendChild(userMessage);

  status("AI is thinking...");

  try {
    const prompt =
      `<|im_start|>system
You are AI Bell, a helpful AI assistant.
If the user speaks Kurdish, answer in Kurdish.
<|im_end|>
<|im_start|>user
${text}
<|im_end|>
<|im_start|>assistant
`;

    const result = await generator(prompt, {
      max_new_tokens: 80,
      do_sample: false
    });

    let answer = "";

    if (result && result[0]) {
      answer = result[0].generated_text || "";
    }

    answer = answer
      .replace(prompt, "")
      .replace(/<\|im_end\|>/g, "")
      .trim();

    if (!answer) {
      answer = "I could not generate a response.";
    }

    const aiMessage = document.createElement("div");
    aiMessage.className = "message assistant";

    const aiBubble = document.createElement("div");
    aiBubble.className = "bubble";
    aiBubble.textContent = answer;

    aiMessage.appendChild(aiBubble);
    messages.appendChild(aiMessage);

    messages.scrollTop = messages.scrollHeight;

    status("AI Ready");

  } catch (error) {
    console.error("Generation error:", error);

    const errorMessage = document.createElement("div");
    errorMessage.className = "message assistant";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent =
      "Sorry, the AI could not generate a response.";

    errorMessage.appendChild(bubble);
    messages.appendChild(errorMessage);

    status("Generation failed");
  }

  thinking = false;
}

document.addEventListener("DOMContentLoaded", () => {

  $("load-ai")?.addEventListener("click", loadAI);

  $("composer")?.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage();
  });

  $("message-input")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

});
