import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { createPeer } from "./client";
import { PeerIdTakenError, PeerConnectionError } from "./errors";

export function hostRoom(
  secret: string
): Promise<{ peer: Peer; conn: DataConnection }> {
  return new Promise((resolve, reject) => {
    const peer = createPeer(secret, 3);

    peer.on("connection", (conn: DataConnection) => {
      resolve({ peer, conn });
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        reject(new PeerIdTakenError(secret));
      } else {
        reject(new PeerConnectionError(err.message, err));
      }
    });
  });
}
