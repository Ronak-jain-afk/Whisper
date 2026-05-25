import type { Session } from "../state/session";

export function renderSasVerify(
  container: HTMLElement,
  session: Session
): void {
  const phrase = session.sas?.phrase ?? "";
  const degraded = session.sas?.degraded ?? false;
  const words = phrase.split(" ");

  container.innerHTML = `
    <div class="screen sas-verify">
      <div class="sas-container">
        <h2 class="sas-heading">Security Verification</h2>
        <p class="sas-instruction">
          FOR YOUR SAFETY, CONFIRM THAT THE PHRASE BELOW MATCHES YOUR PEER'S SCREEN.
        </p>
        
        <div class="sas-phrase-grid">
          ${words.map((word, i) => `
            <div class="sas-word-tile">
              <span class="sas-word-index">${(i + 1).toString().padStart(2, '0')}</span>
              <span class="sas-word-text">${word}</span>
            </div>
          `).join("")}
        </div>

        ${degraded ? `
          <div class="sas-warning">
            <span class="warning-icon">⚠</span>
            <div class="warning-text">
              <strong>CONNECTION FINGERPRINT DEGRADED</strong>
              <p>VERIFY WITH EXTRA CARE</p>
            </div>
          </div>
        ` : ""}

        <div class="sas-actions">
          <button id="sasMatchBtn" class="btn-primary">SECURE MATCH</button>
          <button id="sasMismatchBtn" class="btn-danger">ABORT</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#sasMatchBtn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Initializing...";
    await session.confirmSasMatch();
  });

  container.querySelector("#sasMismatchBtn")?.addEventListener("click", () => {
    session.rejectSasMatch();
  });
}
