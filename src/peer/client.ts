import Peer from "peerjs";

interface PeerOpts {
  host?: string;
  port?: number;
  path?: string;
  key?: string;
  debug?: number;
}

function parsePeerOptions(): PeerOpts {
  const p = new URLSearchParams(window.location.search);
  const opts: PeerOpts = {};
  const host = p.get("peerjs_host");
  if (host) opts.host = host;
  const port = p.get("peerjs_port");
  if (port) opts.port = parseInt(port, 10);
  const path = p.get("peerjs_path");
  if (path) opts.path = path;
  const key = p.get("peerjs_key");
  if (key) opts.key = key;
  return opts;
}

export function createPeer(id?: string, debug = 0): Peer {
  const options = { ...parsePeerOptions(), debug };
  if (id) {
    return new Peer(id, options);
  }
  return new Peer(options);
}
