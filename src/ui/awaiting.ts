import type { Session } from "../state/session";
import QRCode from "qrcode";

export function renderAwaitingPeer(
  container: HTMLElement,
  session: Session
): void {
  const isHost = !!session.secret;
  container.innerHTML = `
    <div class="screen awaiting">
      <div class="awaiting-header">
        <div class="spinner"></div>
        <p class="awaiting-text serif">
          ${isHost ? "Awaiting connection" : "Entering the room"}
        </p>
        ${isHost ? '<p class="awaiting-instruction">SHARE THE SECRET BELOW TO INVITE YOUR PEER</p>' : ""}
      </div>
      
      ${isHost ? `
        <div class="share-block">
          <div class="share-label">ACCESS_SECRET</div>
          <div class="share-content">
            <div class="qr-container">
              <canvas id="qrCanvas"></canvas>
            </div>
            <div class="secret-container">
              <div class="secret-display">
                <code id="secretText">${session.secret}</code>
              </div>
              <button id="copySecretBtn" class="btn-primary copy-btn">COPY SECRET</button>
            </div>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  if (isHost && session.secret) {
    const qrCanvas = container.querySelector("#qrCanvas") as HTMLCanvasElement | null;
    if (qrCanvas) {
      QRCode.toCanvas(qrCanvas, session.secret, { 
        width: 200,
        margin: 2,
        color: {
          dark: "#ccff00", // Acid Neon modules
          light: "#00000000" // Transparent background
        }
      });
    }

    const copyBtn = container.querySelector("#copySecretBtn");
    copyBtn?.addEventListener("click", () => {
      if (session.secret) {
        navigator.clipboard.writeText(session.secret);
      }
    });
  }
}
