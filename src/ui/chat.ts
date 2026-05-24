import type { Session } from "../state/session";

// Single permanent handler — closes emoji panel on outside click
document.addEventListener("click", (e) => {
  const panel = document.getElementById("emojiPanel");
  const btn = document.getElementById("emojiBtn");
  if (!panel || !btn) return;
  if (panel.style.display === "none") return;
  if (panel.contains(e.target as Node)) return;
  if (btn.contains(e.target as Node)) return;
  panel.style.display = "none";
});

const EMOJIS = [
  "😊","😂","❤️","👍","🎉","🔥","😍","💯",
  "🙏","🥺","😢","🤔","😏","🙄","😴","🤗",
  "😎","👀","💀","✨","🎶","💪","🤝","✅",
  "👋","🙌","👏","⭐","🌟","💫","⚡","🎊",
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMessage(m: { kind: string; text: string; sender: string; timestamp: number }): string {
  const time = new Date(m.timestamp).toLocaleTimeString();
  if (m.kind === "image") {
    return `
      <div class="chat-msg ${m.sender}">
        <div class="chat-bubble image">
          <img src="${escapeHtml(m.text)}" alt="Shared image" loading="lazy" />
        </div>
        <span class="chat-time">${time}</span>
      </div>
    `;
  }
  return `
    <div class="chat-msg ${m.sender}">
      <div class="chat-bubble">${escapeHtml(m.text)}</div>
      <span class="chat-time">${time}</span>
    </div>
  `;
}

export function renderChatActive(
  container: HTMLElement,
  session: Session
): void {
  const messagesHtml = session.messages.map(renderMessage).join("");

  container.innerHTML = `
    <div class="screen chat-active">
      <div class="chat-header">
        <span class="status-dot online"></span>
        <span class="chat-header-text serif">Secure Conversation</span>
        <button id="copyChatBtn" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;">Archive</button>
      </div>
      <div class="chat-messages" id="chatMessages">
        ${messagesHtml}
      </div>
      <div class="chat-input-row">
        <div class="emoji-panel" id="emojiPanel" style="display:none">
          ${EMOJIS.map(e => `<button class="emoji-option" data-emoji="${e}">${e}</button>`).join("")}
        </div>
        <div class="chat-input-area">
          <button id="emojiBtn" class="btn-icon" title="Emoji">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button id="imageBtn" class="btn-icon" title="Send image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <input id="chatInput" type="text" placeholder="Whisper something…" autocomplete="off" />
          <button id="sendBtn" class="btn-primary" style="padding: 0.6rem 1.2rem;">Send</button>
        </div>
        <input id="imageInput" type="file" accept="image/*" style="display:none" />
      </div>
    </div>
  `;

  const messagesEl = container.querySelector("#chatMessages") as HTMLElement;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const input = container.querySelector("#chatInput") as HTMLInputElement;
  input.focus();

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    session.sendMessage(text);
    input.value = "";
    input.focus();
  };

  container.querySelector("#sendBtn")?.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  // Emoji panel toggle
  const emojiBtn = container.querySelector("#emojiBtn");
  const emojiPanel = container.querySelector("#emojiPanel") as HTMLElement;

  emojiBtn?.addEventListener("click", () => {
    const isOpen = emojiPanel.style.display === "grid";
    emojiPanel.style.display = isOpen ? "none" : "grid";
  });

  // Emoji insertion at cursor
  emojiPanel.querySelectorAll(".emoji-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = (btn as HTMLElement).dataset.emoji ?? "";
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
      const newPos = start + emoji.length;
      input.selectionStart = input.selectionEnd = newPos;
      input.focus();
    });
  });

  // Image upload
  const imageBtn = container.querySelector("#imageBtn");
  const imageInput = container.querySelector("#imageInput") as HTMLInputElement;

  imageBtn?.addEventListener("click", () => {
    imageInput.click();
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      imageInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 400;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          imageInput.value = "";
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.4);
        session.sendImage(dataUrl);
        imageInput.value = "";
      };
      img.onerror = () => {
        imageInput.value = "";
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      imageInput.value = "";
    };
    reader.readAsDataURL(file);
  });

  container.querySelector("#copyChatBtn")?.addEventListener("click", () => {
    session.copyConversation().catch(() => {});
  });
}
