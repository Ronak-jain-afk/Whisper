import type { Session } from "../state/session";
import type { AbortReason } from "../state/session";

const REASON_MESSAGES: Record<AbortReason, string> = {
  sas_mismatch:
    "Security verification failed — possible eavesdropper detected.",
  connection_lost: "Connection lost — session ended.",
  id_taken:
    "Room ID already taken — generate a new one.",
  timeout: "Session timed out.",
};

export function renderAborted(
  container: HTMLElement,
  session: Session
): void {
  const reason = session.abortReason ?? "connection_lost";
  const message = REASON_MESSAGES[reason];

  const detail = session.errorDetail
    ? `<p class="aborted-detail">${session.errorDetail}</p>`
    : "";

  container.innerHTML = `
    <div class="screen aborted">
      <div class="aborted-icon serif">End</div>
      <p class="aborted-text serif" style="font-size: 1.2rem; color: var(--text);">${message}</p>
      ${detail}
      <button id="backToLobbyBtn" class="btn-primary" style="margin-top: 1.5rem;">Begin Anew</button>
    </div>
  `;

  container.querySelector("#backToLobbyBtn")?.addEventListener("click", () => {
    session.reset();
  });
}
