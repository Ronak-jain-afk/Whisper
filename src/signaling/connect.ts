const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
    username: "peerjs",
    credential: "peerjsp",
  },
];

export interface RoomConn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  close: () => void;
}

const SIGNALING_HOST = "whisper-signal.ronakjain4448.workers.dev";

function signalingUrl(): string {
  const p = new URLSearchParams(window.location.search);
  const host = p.get("peerjs_host") || SIGNALING_HOST;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const port = p.get("peerjs_port") ? `:${p.get("peerjs_port")}` : "";
  const path = p.get("peerjs_path") || "/";
  return `${proto}//${host}${port}${path}room`;
}

function wsOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("Signaling connection failed"));
    setTimeout(() => reject(new Error("Signaling connection timed out")), 10000);
  });
}

function dcOpen(dc: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dc.readyState === "open") { resolve(); return; }
    dc.onopen = () => resolve();
    dc.onerror = () => reject(new Error("Data channel error"));
    setTimeout(() => reject(new Error("Data channel timed out")), 30000);
  });
}

export async function hostRoom(secret: string): Promise<RoomConn> {
  const ws = new WebSocket(`${signalingUrl()}/${secret}`);
  await wsOpen(ws);

  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel("whisper", { ordered: true });

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "answer" && msg.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
      } else if (msg.type === "candidate" && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      }
    } catch { }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate.toJSON() }));
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp! }));

  await dcOpen(dc);

  return {
    pc, dc,
    close: () => { ws.close(); dc.close(); pc.close(); },
  };
}

export async function joinRoom(secret: string): Promise<RoomConn> {
  const ws = new WebSocket(`${signalingUrl()}/${secret}`);
  await wsOpen(ws);

  const pc = new RTCPeerConnection({ iceServers: ICE });

  const dcPromise = new Promise<RTCDataChannel>((resolve) => {
    pc.ondatachannel = (event) => resolve(event.channel);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate.toJSON() }));
    }
  };

  const offer = await new Promise<string>((resolve, reject) => {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "offer" && msg.sdp) {
          resolve(msg.sdp);
        } else if (msg.type === "candidate" && msg.candidate) {
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        }
      } catch { }
    };
    setTimeout(() => reject(new Error("Timed out waiting for offer")), 30000);
  });

  await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offer }));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", sdp: answer.sdp! }));

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "candidate" && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      }
    } catch { }
  };

  const dc = await dcPromise;
  await dcOpen(dc);

  return {
    pc, dc,
    close: () => { ws.close(); dc.close(); pc.close(); },
  };
}
