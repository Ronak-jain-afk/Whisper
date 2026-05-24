import type { Session } from "../state/session";

export function renderLobby(
  container: HTMLElement,
  session: Session
): void {
  container.innerHTML = `
    <div class="screen lobby">
      <div class="lobby-hero">
        <h1 class="lobby-title">Whisper</h1>
        <p class="lobby-subtitle">Secure Peer-to-Peer ephemeral chat</p>
      </div>
      
      <div class="lobby-actions">
        <button id="createRoomBtn" class="btn-primary">Initiate Secure Room</button>
        <div class="lobby-divider"><span>Connection</span></div>
        <div class="lobby-join">
          <input id="joinSecretInput" type="text" placeholder="Paste invitation secret" />
          <button id="joinRoomBtn" class="btn-secondary">Join Room</button>
        </div>
      </div>

      <div class="lobby-features">
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span class="feature-label">End-to-End</span>
        </div>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <span class="feature-label">P2P Private</span>
        </div>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
          </div>
          <span class="feature-label">Ephemeral</span>
        </div>
      </div>
    </div>
  `;

  const createBtn = container.querySelector("#createRoomBtn");
  createBtn?.addEventListener("click", () => {
    session.createRoom();
  });

  const joinBtn = container.querySelector("#joinRoomBtn");
  joinBtn?.addEventListener("click", () => {
    const input = container.querySelector("#joinSecretInput") as HTMLInputElement | null;
    const secret = input?.value.trim() ?? "";
    if (secret) {
      session.joinRoom(secret);
    }
  });

  const joinInput = container.querySelector("#joinSecretInput");
  joinInput?.addEventListener("keydown", (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter") {
      const input = container.querySelector("#joinSecretInput") as HTMLInputElement | null;
      const secret = input?.value.trim() ?? "";
      if (secret) {
        session.joinRoom(secret);
      }
    }
  });
}
