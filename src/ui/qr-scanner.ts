import jsQR from "jsqr";

let stream: MediaStream | null = null;
let animId = 0;

export function openQrScanner(
  onScan: (data: string) => void,
  onCancel: () => void
): void {
  const overlay = document.createElement("div");
  overlay.id = "qrScannerOverlay";
  overlay.innerHTML = `
    <div id="qrScannerInner">
      <video id="qrVideo" playsinline autoplay muted></video>
      <canvas id="qrCanvas" hidden></canvas>
      <div id="qrScannerClose">
        <button id="qrCancelBtn" class="btn-secondary">Cancel</button>
      </div>
      <div id="qrScannerStatus">Position QR code in frame</div>
    </div>
  `;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    background: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  document.body.appendChild(overlay);

  const video = overlay.querySelector("#qrVideo") as HTMLVideoElement;
  const canvas = overlay.querySelector("#qrCanvas") as HTMLCanvasElement;
  const statusEl = overlay.querySelector("#qrScannerStatus") as HTMLElement;

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      video.play();
      scanLoop(video, canvas, statusEl, onScan);
    })
    .catch(() => {
      statusEl.textContent = "Camera unavailable";
    });

  overlay.querySelector("#qrCancelBtn")?.addEventListener("click", closeScanner);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeScanner();
  });

  function closeScanner() {
    cancelAnimationFrame(animId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    overlay.remove();
    onCancel();
  }
}

function scanLoop(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  statusEl: HTMLElement,
  onScan: (data: string) => void
): void {
  if (video.readyState !== video.HAVE_ENOUGH_DATA) {
    animId = requestAnimationFrame(() =>
      scanLoop(video, canvas, statusEl, onScan)
    );
    return;
  }

  const w = video.videoWidth;
  const h = video.videoHeight;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const code = jsQR(imageData.data, w, h);

  if (code) {
    cancelAnimationFrame(animId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    statusEl.textContent = "Code detected!";
    const parent = canvas.closest("#qrScannerOverlay");
    if (parent) parent.remove();
    onScan(code.data);
    return;
  }

  animId = requestAnimationFrame(() =>
    scanLoop(video, canvas, statusEl, onScan)
  );
}
