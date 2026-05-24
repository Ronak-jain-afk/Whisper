import type { Session } from "../state/session";

export function renderSasVerify(
  container: HTMLElement,
  session: Session
): void {
  const phrase = session.sas?.phrase ?? "";
  const degraded = session.sas?.degraded ?? false;

  container.innerHTML = `
    <div class="screen sas-verify">
      <h2 class="sas-heading serif">Security Verification</h2>
      <p class="sas-instruction">
        For your safety, confirm that the phrase below matches your peer's screen.
      </p>
      <div class="sas-phrase serif">${phrase}</div>
      ${degraded ? '<p class="sas-degraded">⚠ Connection fingerprint (degraded)</p>' : ""}
      <div class="sas-actions">
        <button id="sasMatchBtn" class="btn-primary">Secure Match</button>
        <button id="sasMismatchBtn" class="btn-danger">Abort</button>
      </div>
    </div>
  `;

  container.querySelector("#sasMatchBtn")?.addEventListener("click", () => {
    session.confirmSasMatch();
  });

  container.querySelector("#sasMismatchBtn")?.addEventListener("click", () => {
    session.rejectSasMatch();
  });
}
