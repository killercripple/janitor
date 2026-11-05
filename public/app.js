const conversationEl = document.getElementById("conversation");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");

const SECTION_LABELS = ["NAME", "TAGLINE", "PERSONALITY", "SCENARIO", "FIRST MESSAGE", "EXAMPLE DIALOGUES"];
const LABEL_RE = new RegExp(
  "^\\s*(?:#{1,6}\\s*)?\\*{0,2}\\s*(" + SECTION_LABELS.join("|") + ")\\s*\\*{0,2}\\s*:\\s*(.*)$",
  "i"
);

const transcript = [];
let streaming = false;

document.addEventListener("contextmenu", (event) => event.preventDefault());

function parseSections(raw) {
  const sections = [];
  let current = { label: "", lines: [] };
  for (const line of raw.split("\n")) {
    const match = line.match(LABEL_RE);
    if (match) {
      sections.push(current);
      current = { label: match[1].toUpperCase(), lines: [match[2]] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections
    .map((section) => ({ label: section.label, text: section.lines.join("\n").trim() }))
    .filter((section) => section.label !== "" || section.text !== "");
}

function renderAssistant(container, raw) {
  container.textContent = "";
  for (const section of parseSections(raw)) {
    const card = document.createElement("section");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("h2");
    title.textContent = section.label || "OUTPUT";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.setAttribute("aria-label", "Copy " + title.textContent + " section");
    copyBtn.addEventListener("click", () => copyText(section.text, copyBtn));
    head.append(title, copyBtn);

    const body = document.createElement("pre");
    body.className = "card-body";
    body.textContent = section.text;

    card.append(head, body);
    container.append(card);
  }
}

function flashButton(btn, message) {
  const original = btn.textContent;
  btn.textContent = message;
  setTimeout(() => {
    btn.textContent = original;
  }, 1200);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    flashButton(btn, "Copied!");
    return;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    try {
      document.execCommand("copy");
      flashButton(btn, "Copied!");
    } catch {
      flashButton(btn, "Copy failed");
    }
    helper.remove();
  }
}

function showError(container, message) {
  const box = document.createElement("div");
  box.className = "error-box";
  box.setAttribute("role", "alert");
  box.textContent = message;
  container.append(box);
}

function setBusy(busy) {
  streaming = busy;
  sendBtn.disabled = busy;
}

async function send() {
  if (streaming) return;
  const message = inputEl.value.trim();
  if (!message) {
    statusEl.textContent = "Type a description first.";
    inputEl.focus();
    return;
  }

  setBusy(true);
  statusEl.textContent = "Generating...";
  inputEl.value = "";

  const userMsg = document.createElement("div");
  userMsg.className = "msg msg-user";
  const userLabel = document.createElement("p");
  userLabel.className = "msg-label";
  userLabel.textContent = "You";
  const userBody = document.createElement("pre");
  userBody.className = "msg-body";
  userBody.textContent = message;
  userMsg.append(userLabel, userBody);
  conversationEl.append(userMsg);

  const aiMsg = document.createElement("div");
  aiMsg.className = "msg msg-ai";
  const aiLabel = document.createElement("p");
  aiLabel.className = "msg-label";
  aiLabel.textContent = "Bot Builder";
  const aiBody = document.createElement("div");
  aiBody.className = "ai-body";
  aiMsg.append(aiLabel, aiBody);
  conversationEl.append(aiMsg);
  window.scrollTo({ top: document.body.scrollHeight });

  let raw = "";
  let failed = false;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!response.ok || !response.body) {
      let detail = "Request failed (" + response.status + ")";
      try {
        const parsed = await response.json();
        if (parsed.error) detail = parsed.error;
      } catch {
        // keep default detail
      }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let scheduled = false;
    const scheduleRender = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        renderAssistant(aiBody, raw);
      });
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (typeof event.text === "string" && event.text) {
            raw += event.text;
            scheduleRender();
          } else if (event.error) {
            failed = true;
            showError(aiMsg, event.error);
          }
        }
      }
    }
    renderAssistant(aiBody, raw);
    if (raw.trim()) {
      transcript.push({ role: "you", text: message }, { role: "bot", text: raw });
    }
  } catch (err) {
    failed = true;
    showError(aiMsg, err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(false);
    statusEl.textContent = failed ? "Something went wrong. Check the error below and try again." : "";
    inputEl.focus();
  }
}

composerEl.addEventListener("submit", (event) => {
  event.preventDefault();
  send();
});

inputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    send();
  }
});

downloadBtn.addEventListener("click", () => {
  if (transcript.length === 0) {
    statusEl.textContent = "Nothing to download yet.";
    return;
  }
  const separator = "\n\n" + "-".repeat(40) + "\n\n";
  const parts = transcript.map((entry) =>
    entry.role === "you" ? "=== YOU ===\n" + entry.text : "=== BOT BUILDER ===\n" + entry.text
  );
  const blob = new Blob([parts.join(separator) + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "janitorai-character.txt";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = "Downloaded janitorai-character.txt";
});

resetBtn.addEventListener("click", async () => {
  if (streaming) return;
  try {
    await fetch("/api/reset", { method: "POST" });
  } catch {
    statusEl.textContent = "Could not reach the server.";
    return;
  }
  transcript.length = 0;
  conversationEl.textContent = "";
  inputEl.value = "";
  statusEl.textContent = "History cleared. Start a new character.";
  inputEl.focus();
});
