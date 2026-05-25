import { StateMachine } from "./machine";
import type { AppState, Message } from "./types";
import { hostRoom, joinRoom } from "../signaling/connect";
import type { RoomConn } from "../signaling/connect";
import { generateSasPhrase } from "../sas/generate";
import { generateSecret } from "../utils/secret";
import { copyToClipboard } from "../utils/clipboard";
import { deriveKey, encrypt, decrypt } from "../crypto/keychain";

export type AbortReason =
  | "sas_mismatch"
  | "connection_lost"
  | "id_taken"
  | "timeout";

export interface SasResult {
  phrase: string;
  degraded: boolean;
}

export type StateChangeCallback = (
  state: AppState,
  session: Session
) => void;

const SAS_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_MSG_RATE = 10;
const RATE_WINDOW_MS = 1000;
const MAX_MSG_LENGTH = 10_000;
const MAX_IMAGE_SIZE = 50_000;
const MAX_FILE_SIZE = 250_000;
const MAX_MESSAGES = 500;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 30_000;
const TYPING_TIMEOUT_MS = 3_000;

export class Session {
  readonly state = new StateMachine("LOBBY");
  readonly messages: Message[] = [];

  pc: RTCPeerConnection | null = null;
  dc: RTCDataChannel | null = null;
  private roomConn: RoomConn | null = null;
  secret: string | null = null;
  sas: SasResult | null = null;
  abortReason: AbortReason | null = null;
  errorDetail: string | null = null;
  peerTyping = false;
  cryptoKey: CryptoKey | null = null;
  peerConnected = false;
  sessionStartTime: number | null = null;

  private stateChangeCbs: StateChangeCallback[] = [];
  private sasTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private sendTimestamps: number[] = [];
  private hiddenSince: number | null = null;
  private cleanedUp = false;
  private peerTypingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  onStateChange(cb: StateChangeCallback): void {
    this.stateChangeCbs.push(cb);
  }

  removeStateChangeListener(cb: StateChangeCallback): void {
    this.stateChangeCbs = this.stateChangeCbs.filter((l) => l !== cb);
  }

  private notifyStateChange(): void {
    for (const cb of this.stateChangeCbs) {
      try {
        cb(this.state.current, this);
      } catch {
        // Silently skip crashed callbacks
      }
    }
  }

  createRoom(): void {
    if (this.state.current !== "LOBBY") return;

    const secret = generateSecret();
    this.secret = secret;

    this.state.transition("AWAITING_PEER");
    this.notifyStateChange();

    this.startConnectTimeout();

    hostRoom(secret)
      .then((room) => {
        this.roomConn = room;
        this.pc = room.pc;
        this.dc = room.dc;
        this.clearConnectTimeout();
        this.wireConnection(room.pc, room.dc);
      })
      .catch((err) => {
        this.clearConnectTimeout();
        this.errorDetail = err instanceof Error ? err.message : String(err);
        this.abortReason = "connection_lost";
        this.goAborted("connection_lost");
      });
  }

  joinRoom(secret: string): void {
    if (this.state.current !== "LOBBY") return;

    this.secret = secret;

    this.state.transition("AWAITING_PEER");
    this.notifyStateChange();

    this.startConnectTimeout();

    joinRoom(secret)
      .then((room) => {
        this.roomConn = room;
        this.pc = room.pc;
        this.dc = room.dc;
        this.clearConnectTimeout();
        this.wireConnection(room.pc, room.dc);
      })
      .catch((err) => {
        this.clearConnectTimeout();
        this.errorDetail = err instanceof Error ? err.message : String(err);
        this.abortReason = "connection_lost";
        this.goAborted("connection_lost");
      });
  }

  private startConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimeoutId = setTimeout(() => {
      if (this.cleanedUp || this.state.current === "ABORTED") return;
      this.errorDetail = "Timed out waiting for peer to connect (30s)";
      this.abortReason = "timeout";
      this.cleanup();
      this.state.transition("ABORTED");
      this.notifyStateChange();
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  private wireConnection(pc: RTCPeerConnection, dc: RTCDataChannel): void {
    const onOpen = async () => {
      try {
        const result = await generateSasPhrase(pc);
        this.sas = result;
        this.peerConnected = true;
        this.state.transition("SAS_VERIFY");
        this.notifyStateChange();
        this.startSasTimeout();
        this.startIdleDetection();
      } catch {
        this.peerConnected = false;
        this.abortReason = "connection_lost";
        this.goAborted("connection_lost");
      }
    };

    if (dc.readyState === "open") {
      onOpen();
    } else {
      dc.onopen = onOpen;
    }

    dc.onmessage = (event: MessageEvent) => {
      if (this.cleanedUp) return;
      if (typeof event.data !== "string") return;

      const processIncoming = (raw: string): void => {
        let parsed: { kind?: string; text?: string; data?: string; type?: string; name?: string; size?: number; enc?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { kind: "text", text: raw };
        }
        if (parsed.enc && this.cryptoKey) {
          decrypt(this.cryptoKey, parsed.enc).then((decrypted) => {
            processIncoming(decrypted);
          }).catch(() => {
            // Decryption failed — drop message
          });
          return;
        }
        if (parsed.kind === "control") {
          if (parsed.type === "typing") {
            this.peerTyping = true;
            this.clearPeerTypingTimeout();
            this.peerTypingTimeoutId = setTimeout(() => {
              this.peerTyping = false;
              this.peerTypingTimeoutId = null;
              this.notifyStateChange();
            }, TYPING_TIMEOUT_MS);
            this.notifyStateChange();
          }
          return;
        }
        if (parsed.kind === "file") {
          const fileData = parsed.data ?? "";
          if (fileData.length > MAX_FILE_SIZE) return;
          const msg: Message = {
            id: crypto.randomUUID(),
            kind: "file",
            text: fileData,
            sender: "peer",
            timestamp: Date.now(),
            fileName: parsed.name ?? "file",
            fileSize: parsed.size ?? fileData.length,
          };
          this.messages.push(msg);
        } else if (parsed.kind === "image") {
          const imgData = parsed.data ?? "";
          if (imgData.length > MAX_IMAGE_SIZE) return;
          const msg: Message = {
            id: crypto.randomUUID(),
            kind: "image",
            text: imgData,
            sender: "peer",
            timestamp: Date.now(),
          };
          this.messages.push(msg);
        } else {
          const text = (parsed.text ?? "").slice(0, MAX_MSG_LENGTH);
          if (!text) return;
          const msg: Message = {
            id: crypto.randomUUID(),
            kind: "text",
            text,
            sender: "peer",
            timestamp: Date.now(),
          };
          this.messages.push(msg);
        }
        if (this.messages.length > MAX_MESSAGES) {
          this.messages.splice(0, this.messages.length - MAX_MESSAGES);
        }
        this.notifyStateChange();
      };

      processIncoming(event.data as string);
    };

    dc.onclose = () => {
      this.peerConnected = false;
      if (this.cleanedUp) return;
      this.goAborted("connection_lost");
    };

    dc.onerror = () => {
      this.peerConnected = false;
      if (this.cleanedUp) return;
      this.goAborted("connection_lost");
    };
  }

  private startSasTimeout(): void {
    this.clearSasTimeout();
    this.sasTimeoutId = setTimeout(() => {
      if (this.cleanedUp) return;
      if (this.state.current === "SAS_VERIFY") {
        this.goAborted("timeout");
      }
    }, SAS_TIMEOUT_MS);
  }

  private clearSasTimeout(): void {
    if (this.sasTimeoutId !== null) {
      clearTimeout(this.sasTimeoutId);
      this.sasTimeoutId = null;
    }
  }

  private clearPeerTypingTimeout(): void {
    if (this.peerTypingTimeoutId !== null) {
      clearTimeout(this.peerTypingTimeoutId);
      this.peerTypingTimeoutId = null;
    }
  }

  private startIdleDetection(): void {
    this.stopIdleDetection();
    this.hiddenSince = null;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private stopIdleDetection(): void {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.hiddenSince = null;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.hiddenSince = Date.now();
    } else {
      if (this.hiddenSince !== null && this.state.current !== "ABORTED") {
        const elapsed = Date.now() - this.hiddenSince;
        if (elapsed >= IDLE_TIMEOUT_MS) {
          this.goAborted("timeout");
        }
      }
      this.hiddenSince = null;
    }
  };

  async confirmSasMatch(): Promise<void> {
    if (this.state.current !== "SAS_VERIFY") return;
    this.clearSasTimeout();
    if (this.secret && !this.cryptoKey) {
      try {
        this.cryptoKey = await deriveKey(this.secret);
      } catch {
        // Encryption unavailable — messages sent in plaintext
      }
    }
    this.sessionStartTime = Date.now();
    this.state.transition("CHAT_ACTIVE");
    this.notifyStateChange();
  }

  rejectSasMatch(): void {
    if (this.state.current !== "SAS_VERIFY") return;
    this.clearSasTimeout();
    this.goAborted("sas_mismatch");
  }

  private sendEncrypted(jsonPayload: string): void {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") return;
    if (this.cryptoKey) {
      encrypt(this.cryptoKey, jsonPayload).then((enc) => {
        try { dc.send(JSON.stringify({ enc })); } catch { }
      }).catch(() => {
        try { dc.send(jsonPayload); } catch { }
      });
    } else {
      try { dc.send(jsonPayload); } catch { }
    }
  }

  sendMessage(text: string): void {
    if (!this.dc || this.state.current !== "CHAT_ACTIVE") return;
    if (this.cleanedUp) return;

    const trimmed = text.trim();
    if (!trimmed) return;
    const truncated = trimmed.slice(0, MAX_MSG_LENGTH);

    const now = Date.now();
    this.sendTimestamps = this.sendTimestamps.filter(
      (t) => now - t < RATE_WINDOW_MS
    );
    if (this.sendTimestamps.length >= MAX_MSG_RATE) return;
    this.sendTimestamps.push(now);

    const msg: Message = {
      id: crypto.randomUUID(),
      kind: "text",
      text: truncated,
      sender: "self",
      timestamp: now,
    };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    this.sendEncrypted(JSON.stringify({ kind: "text", text: truncated }));
    this.notifyStateChange();
  }

  sendImage(dataUrl: string): void {
    if (!this.dc || this.state.current !== "CHAT_ACTIVE") return;
    if (this.cleanedUp) return;
    if (dataUrl.length > MAX_IMAGE_SIZE) return;

    const now = Date.now();
    this.sendTimestamps = this.sendTimestamps.filter(
      (t) => now - t < RATE_WINDOW_MS
    );
    if (this.sendTimestamps.length >= MAX_MSG_RATE) return;
    this.sendTimestamps.push(now);

    const msg: Message = {
      id: crypto.randomUUID(),
      kind: "image",
      text: dataUrl,
      sender: "self",
      timestamp: now,
    };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    this.sendEncrypted(JSON.stringify({ kind: "image", data: dataUrl }));
    this.notifyStateChange();
  }

  sendTyping(): void {
    if (!this.dc || this.state.current !== "CHAT_ACTIVE") return;
    if (this.cleanedUp) return;
    this.sendEncrypted(JSON.stringify({ kind: "control", type: "typing" }));
  }

  sendFile(name: string, dataUrl: string): void {
    if (!this.dc || this.state.current !== "CHAT_ACTIVE") return;
    if (this.cleanedUp) return;
    if (dataUrl.length > MAX_FILE_SIZE) return;

    const now = Date.now();
    this.sendTimestamps = this.sendTimestamps.filter(
      (t) => now - t < RATE_WINDOW_MS
    );
    if (this.sendTimestamps.length >= MAX_MSG_RATE) return;
    this.sendTimestamps.push(now);

    const msg: Message = {
      id: crypto.randomUUID(),
      kind: "file",
      text: dataUrl,
      sender: "self",
      timestamp: now,
      fileName: name,
      fileSize: dataUrl.length,
    };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    this.sendEncrypted(JSON.stringify({ kind: "file", name, size: dataUrl.length, data: dataUrl }));
    this.notifyStateChange();
  }

  async copyConversation(): Promise<boolean> {
    const text = this.messages
      .map((m) => {
        const label = m.sender === "self" ? "You" : "Peer";
        const time = new Date(m.timestamp).toLocaleTimeString();
        const content = m.kind === "image" ? "[Image]" : m.kind === "file" ? `[File: ${m.fileName ?? "unknown"}]` : m.text;
        return `[${time}] ${label}: ${content}`;
      })
      .join("\n");
    return copyToClipboard(text);
  }

  reset(): void {
    this.clearConnectTimeout();
    this.clearSasTimeout();
    this.clearPeerTypingTimeout();
    this.stopIdleDetection();
    this.cleanup();
    this.messages.length = 0;
    this.sas = null;
    this.abortReason = null;
    this.errorDetail = null;
    this.secret = null;
    this.sendTimestamps = [];
    this.peerTyping = false;
    this.peerConnected = false;
    this.sessionStartTime = null;
    this.state.reset();
    this.cleanedUp = false;
    this.notifyStateChange();
  }

  private goAborted(reason: AbortReason): void {
    if (this.cleanedUp || this.state.current === "ABORTED") return;
    this.cleanedUp = true;
    this.clearConnectTimeout();
    this.clearSasTimeout();
    this.clearPeerTypingTimeout();
    this.stopIdleDetection();
    this.peerTyping = false;
    this.abortReason = reason;
    this.cleanup();
    this.messages.length = 0;
    this.state.transition("ABORTED");
    this.notifyStateChange();
  }

  private cleanup(): void {
    this.roomConn?.close();
    this.roomConn = null;
    this.pc = null;
    this.dc = null;
  }
}
