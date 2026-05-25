import type { Session } from "../state/session";
import { openQrScanner } from "./qr-scanner";

export function renderLobby(
  container: HTMLElement,
  session: Session
): void {
  container.innerHTML = `
    <div class="screen lobby">
      <div class="lobby-main">
        <div class="lobby-hero">
          <h1 class="lobby-title">Whisper</h1>
          <p class="lobby-subtitle">Secure Peer-to-Peer ephemeral chat</p>
        </div>
        
        <div class="lobby-actions">
          <button id="createRoomBtn" class="btn-primary">Initiate Secure Room</button>
          <div class="lobby-divider"><span>Connection</span></div>
          <div class="lobby-join">
            <div style="display:flex;gap:0.5rem;width:100%">
              <input id="joinSecretInput" type="text" placeholder="Paste invitation secret" style="flex:1" />
              <button id="qrScanBtn" class="btn-icon" title="Scan QR code" style="flex-shrink:0;width:3rem!important;height:3rem!important">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.2rem;height:1.2rem">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                  <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <rect x="7" y="7" width="3" height="3"/>
                  <rect x="14" y="7" width="3" height="3"/>
                  <rect x="7" y="14" width="3" height="3"/>
                  <rect x="14" y="14" width="3" height="3"/>
                </svg>
              </button>
            </div>
            <button id="joinRoomBtn" class="btn-secondary">Join Room</button>
          </div>
        </div>

        <div class="lobby-features">
          <div class="feature-item" id="tag-e2e" data-target="section-e2e">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <span class="feature-label">End-to-End</span>
          </div>
          <div class="feature-item" id="tag-p2p" data-target="section-p2p">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span class="feature-label">P2P Private</span>
          </div>
          <div class="feature-item" id="tag-ephemeral" data-target="section-ephemeral">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
            </div>
            <span class="feature-label">Ephemeral</span>
          </div>
        </div>
      </div>

      <div class="lobby-manual">
        <section class="manual-section" id="section-e2e">
          <div class="numeral">01</div>
          <h3 class="manual-header serif">E2E // End-to-End Encryption</h3>
          <p class="manual-body">
            Security is not a promise; it is a mathematical certainty. Your messages are encrypted on your device before they ever touch the network.
            <br/><br/>
            To verify the integrity of that encryption, you will perform a <strong>Security Verification</strong>. By confirming that the four-word Short Authentication String (SAS) matches on both screens, you prove that no third party is intercepting your conversation. If the words match, you are alone in the channel.
          </p>
        </section>

        <section class="manual-section" id="section-p2p">
          <div class="numeral">02</div>
          <h3 class="manual-header serif">P2P // Peer-to-Peer Architecture</h3>
          <p class="manual-body">
            Whisper eliminates the middleman. Using WebRTC, we establish a direct line between your browser and your peer's, no server in between.
            <br/><br/>
            Your data is never stored on a central server. There is no database to breach, no logs to subpoena, and no administrative backdoors. Your conversation is a direct exchange of packets between two points, and nowhere else.
          </p>
        </section>

        <section class="manual-section" id="section-ephemeral">
          <div class="numeral">03</div>
          <h3 class="manual-header serif">EML // Ephemeral Existence</h3>
          <p class="manual-body">
            Every session ends completely. When you close Whisper, keys are discarded and your message history vanishes from memory, automatically, with no action required.
            <br/><br/>
            Whisper does not have a "Delete" button because there is nothing to delete. Closing the tab is the ultimate act of redaction. Your conversation exists only as long as you do.
          </p>
        </section>
      </div>
    </div>
  `;

  // --- Click to Scroll ---
  const features = container.querySelectorAll(".feature-item");
  features.forEach(item => {
    item.addEventListener("click", () => {
      const targetId = (item as HTMLElement).dataset.target;
      const targetEl = container.querySelector(`#${targetId}`);
      targetEl?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // --- Scrollspy ---
  const lobbyScreen = container.querySelector(".screen.lobby") as HTMLElement;
  const sections = container.querySelectorAll(".manual-section");
  const observerOptions = {
    root: lobbyScreen,
    threshold: 0.6
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        const tagId = id === "section-e2e" ? "tag-e2e" : (id === "section-p2p" ? "tag-p2p" : "tag-ephemeral");
        
        container.querySelectorAll(".feature-item").forEach(tag => tag.classList.remove("active"));
        container.querySelector(`#${tagId}`)?.classList.add("active");
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));

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

  const qrBtn = container.querySelector("#qrScanBtn");
  qrBtn?.addEventListener("click", () => {
    openQrScanner(
      (data) => {
        const input = container.querySelector("#joinSecretInput") as HTMLInputElement | null;
        if (input) {
          input.value = data;
          session.joinRoom(data);
        }
      },
      () => {}
    );
  });
}
