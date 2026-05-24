import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { createPeer } from "./client";
import { PeerConnectionError } from "./errors";

export function joinRoom(
  secret: string
): Promise<{ peer: Peer; conn: DataConnection }> {
  return new Promise((resolve, reject) => {
    const peer = createPeer(undefined, 3);

    peer.on("open", () => {
      const conn = peer.connect(secret);

      conn.on("open", () => {
        resolve({ peer, conn });
      });

      conn.on("error", (err) => {
        reject(new PeerConnectionError(err.message, err));
      });
    });

    peer.on("error", (err) => {
      reject(new PeerConnectionError(err.message, err));
    });
  });
}
