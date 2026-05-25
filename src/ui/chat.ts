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

let audioCtx: AudioContext | null = null;
let lastNotifiedId: string | null = null;
let searchTerm = "";
let typingDebounceId: ReturnType<typeof setTimeout> | null = null;

function playNotificationSound(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  } catch {
    // Audio unavailable -- silently skip
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessage(m: { id: string; kind: string; text: string; sender: string; timestamp: number; fileName?: string; fileSize?: number }): string {
  const time = new Date(m.timestamp).toLocaleTimeString();
  const sentIcon = m.sender === "self"
    ? `<svg class="sent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : "";
  if (m.kind === "image") {
    return `
      <div class="chat-msg ${m.sender}">
        <div class="chat-bubble image">
          <img src="${escapeHtml(m.text)}" alt="Shared image" loading="lazy" />
        </div>
        <span class="chat-time">${time}${sentIcon}</span>
      </div>
    `;
  }
  if (m.kind === "file") {
    const name = escapeHtml(m.fileName ?? "file");
    const size = formatFileSize(m.fileSize ?? 0);
    return `
      <div class="chat-msg ${m.sender}">
        <div class="chat-bubble file" data-file-id="${escapeHtml(m.id)}">
          <div class="file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="file-info">
            <div class="file-name">${name}</div>
            <div class="file-meta">${size}</div>
          </div>
          <button class="file-download-btn" data-file-id="${escapeHtml(m.id)}" title="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
        <span class="chat-time">${time}${sentIcon}</span>
      </div>
    `;
  }
  return `
    <div class="chat-msg ${m.sender}">
      <div class="chat-bubble">${escapeHtml(m.text)}</div>
      <span class="chat-time">${time}${sentIcon}</span>
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
        <div class="header-actions">
          <button id="searchToggleBtn" class="btn-icon" title="Search messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button id="copyChatBtn" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;">Archive</button>
        </div>
      </div>
      <div class="chat-search${searchTerm ? "" : ""}" id="chatSearch"${searchTerm ? "" : ' style="display:none"'}>
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="searchInput" type="text" placeholder="Search messages…" autocomplete="off" value="${escapeHtml(searchTerm)}" />
        <button id="searchClearBtn" class="btn-icon" title="Clear search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="chat-messages" id="chatMessages">
        ${messagesHtml}
      </div>
      <button id="scrollBottomBtn" class="scroll-bottom-btn" style="display:none" title="Scroll to bottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
      </button>
      <div class="typing-indicator" id="typingIndicator"${session.peerTyping ? "" : ' style="display:none"'}>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-text">Peer is typing…</span>
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
          <button id="fileBtn" class="btn-icon" title="Send file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </button>
          <input id="chatInput" type="text" placeholder="Whisper something…" autocomplete="off" />
          <button id="sendBtn" class="btn-primary" style="padding: 0.6rem 1.2rem;">Send</button>
        </div>
        <input id="imageInput" type="file" accept="image/*" style="display:none" />
        <input id="fileInput" type="file" style="display:none" />
      </div>
    </div>
  `;

  const messagesEl = container.querySelector("#chatMessages") as HTMLElement;
  const scrollBtn = container.querySelector("#scrollBottomBtn") as HTMLElement;

  const SCROLL_THRESHOLD = 200;

  function isNearBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }

  messagesEl.addEventListener("scroll", () => {
    scrollBtn.style.display = isNearBottom(messagesEl) ? "none" : "flex";
  });

  if (isNearBottom(messagesEl)) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  scrollBtn.addEventListener("click", () => {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  });

  // Search
  function applySearchFilter(): void {
    const msgs = messagesEl.querySelectorAll<HTMLElement>(".chat-msg");
    const term = searchTerm.toLowerCase();
    msgs.forEach((msg) => {
      const bubble = msg.querySelector(".chat-bubble");
      const text = bubble?.textContent ?? "";
      const match = !term || text.toLowerCase().includes(term);
      msg.style.display = match ? "" : "none";
    });
  }

  const searchContainer = container.querySelector("#chatSearch") as HTMLElement;
  const searchInput = container.querySelector("#searchInput") as HTMLInputElement;
  const searchClearBtn = container.querySelector("#searchClearBtn");
  const searchToggleBtn = container.querySelector("#searchToggleBtn");

  if (searchTerm) {
    searchContainer.style.display = "flex";
    applySearchFilter();
  }

  searchToggleBtn?.addEventListener("click", () => {
    const isOpen = searchContainer.style.display !== "none";
    if (isOpen) {
      searchContainer.style.display = "none";
      searchTerm = "";
      searchInput.value = "";
      applySearchFilter();
    } else {
      searchContainer.style.display = "flex";
      searchInput.focus();
    }
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = searchInput.value;
    applySearchFilter();
  });

  searchClearBtn?.addEventListener("click", () => {
    searchTerm = "";
    searchInput.value = "";
    applySearchFilter();
    searchInput.focus();
  });

  // Notification sound for new peer messages
  const msgs = session.messages;
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    if (last.sender === "peer" && last.id !== lastNotifiedId) {
      lastNotifiedId = last.id;
      playNotificationSound();
    }
  }

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

  input.addEventListener("input", () => {
    if (typingDebounceId !== null) {
      clearTimeout(typingDebounceId);
    }
    typingDebounceId = setTimeout(() => {
      typingDebounceId = null;
      session.sendTyping();
    }, 2000);
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

  // File upload
  const fileBtn = container.querySelector("#fileBtn");
  const fileInput = container.querySelector("#fileInput") as HTMLInputElement;

  fileBtn?.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      session.sendFile(file.name, dataUrl);
      fileInput.value = "";
    };
    reader.onerror = () => {
      fileInput.value = "";
    };
    reader.readAsDataURL(file);
  });

  // File download (delegated)
  messagesEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".file-download-btn");
    if (!btn) return;
    const id = btn.getAttribute("data-file-id");
    if (!id) return;
    const msg = session.messages.find((m) => m.id === id);
    if (!msg || msg.kind !== "file") return;
    downloadFile(msg.text, msg.fileName ?? "file");
  });

  function downloadFile(dataUrl: string, fileName: string): void {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
