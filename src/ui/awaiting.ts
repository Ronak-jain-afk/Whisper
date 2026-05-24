import type { Session } from "../state/session";
import QRCode from "qrcode";

export function renderAwaitingPeer(
  container: HTMLElement,
  session: Session
): void {
  const isHost = !!session.secret;
  container.innerHTML = `
    <div class="screen awaiting">
      <div class="spinner"></div>
      <p class="awaiting-text serif">
        ${isHost ? "Awaiting connection" : "Entering the room"}
      </p>
      ${isHost ? `
        <div class="awaiting-secret">
          <p class="awaiting-label">Private Invitation Secret</p>
          <div class="secret-display">
            <code id="secretText">${session.secret}</code>
            <button id="copySecretBtn" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;">Copy</button>
          </div>
          <div style="margin-top: 1rem; padding: 1rem; background: #fff; border-radius: var(--radius-sm);">
            <canvas id="qrCanvas"></canvas>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  if (isHost && session.secret) {
    const qrCanvas = container.querySelector("#qrCanvas") as HTMLCanvasElement | null;
    if (qrCanvas) {
      QRCode.toCanvas(qrCanvas, session.secret, { width: 180 });
    }

    const copyBtn = container.querySelector("#copySecretBtn");
    copyBtn?.addEventListener("click", () => {
      if (session.secret) {
        navigator.clipboard.writeText(session.secret);
      }
    });
  }
}
