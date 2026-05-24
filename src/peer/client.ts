import Peer from "peerjs";

export function createPeer(id?: string, debug = 0): Peer {
  if (id) {
    return new Peer(id, { debug });
  }
  return new Peer({ debug });
}
