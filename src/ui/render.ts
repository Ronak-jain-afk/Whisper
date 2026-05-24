import type { Session } from "../state/session";
import { renderLobby } from "./lobby";
import { renderAwaitingPeer } from "./awaiting";
import { renderSasVerify } from "./sasVerify";
import { renderChatActive } from "./chat";
import { renderAborted } from "./aborted";

function getApp(): HTMLElement {
  const el = document.getElementById("app");
  if (!el) throw new Error("Root element #app not found in DOM");
  return el;
}
const app = getApp();

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function render(session: Session): void {
  try {
    const state = session.state.current;
    app.innerHTML = "";

    switch (state) {
      case "LOBBY":
        renderLobby(app, session);
        break;
      case "AWAITING_PEER":
        renderAwaitingPeer(app, session);
        break;
      case "SAS_VERIFY":
        renderSasVerify(app, session);
        break;
      case "CHAT_ACTIVE":
        renderChatActive(app, session);
        break;
      case "ABORTED":
        renderAborted(app, session);
        break;
    }
  } catch (err) {
    app.innerHTML = `
      <div class="screen aborted">
        <div class="aborted-icon serif">Error</div>
        <p class="aborted-text serif" style="font-size: 1.2rem; color: var(--text);">Something went wrong: ${err instanceof Error ? escapeHtml(err.message) : "Unknown error"}</p>
        <button id="backToLobbyBtn" class="btn-primary" style="margin-top: 1.5rem;">Begin Anew</button>
      </div>
    `;
    const btn = app.querySelector("#backToLobbyBtn");
    if (btn) {
      btn.addEventListener("click", () => session.reset());
    }
  }
}

export function renderOnChange(session: Session): void {
  session.onStateChange(() => {
    render(session);
  });
}
