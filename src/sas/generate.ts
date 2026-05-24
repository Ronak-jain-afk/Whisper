import type { DataConnection } from "peerjs";
import { WORDLIST } from "./wordlist";

const FINGERPRINT_ALGORITHM = "sha-256";

function hexStringToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/:/g, "").toLowerCase();
  if (cleaned.length % 2 !== 0) {
    throw new Error("Fingerprint hex string has odd length");
  }
  if (!/^[0-9a-f]*$/.test(cleaned)) {
    throw new Error("Fingerprint hex string contains invalid characters");
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function sasFromBytes(bytes: Uint8Array): string {
  const truncated = new Uint8Array(6);
  truncated.set(bytes.slice(0, 6));
  truncated[5] &= 0x0f;

  const words: string[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of truncated) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 11) {
      bits -= 11;
      const idx = (acc >> bits) & 0x7ff;
      words.push(WORDLIST[idx]);
    }
  }
  if (bits > 0) {
    const idx = (acc & 0x7ff) >>> 0;
    words.push(WORDLIST[idx]);
  }

  return words.slice(0, 4).join(" ");
}

function parseFingerprintFromSdp(sdp: string): string | null {
  for (const line of sdp.split("\n")) {
    const trimmed = line.trim();
    const prefix = `a=fingerprint:${FINGERPRINT_ALGORITHM} `;
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return null;
}

async function extractFingerprint(
  conn: DataConnection
): Promise<{ hex: string; degraded: boolean }> {
  const pc: RTCPeerConnection | null = (conn as any).peerConnection ?? null;
  if (!pc) {
    throw new Error("No peerConnection available on DataConnection");
  }

  try {
    const certs = await (pc as any).getRemoteCertificates();
    if (certs && certs.length > 0) {
      const cert = certs[0];
      if (typeof (cert as any).getFingerprints === "function") {
        const fingerprints = (cert as any).getFingerprints() as {
          algorithm: string;
          value: string;
        }[];
        const sha = fingerprints.find(
          (f) => f.algorithm === FINGERPRINT_ALGORITHM
        );
        if (sha) {
          return { hex: sha.value, degraded: false };
        }
      }
    }
  } catch {
    // Fall through to SDP fallback
  }

  const sdp = pc.remoteDescription?.sdp;
  if (!sdp) {
    throw new Error("No remote SDP available for fingerprint fallback");
  }

  const fp = parseFingerprintFromSdp(sdp);
  if (!fp) {
    throw new Error(
      "Could not extract fingerprint from remote SDP"
    );
  }

  return { hex: fp, degraded: true };
}

export async function generateSasPhrase(
  conn: DataConnection
): Promise<{ phrase: string; degraded: boolean }> {
  const { hex, degraded } = await extractFingerprint(conn);
  const bytes = hexStringToBytes(hex);
  const phrase = sasFromBytes(bytes);
  return { phrase, degraded };
}
