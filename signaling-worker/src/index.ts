export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomName = url.pathname.replace(/^\/room\//, "");
    if (!roomName) {
      return new Response("Use /room/<secret>", { status: 400 });
    }
    const id = env.ROOM.idFromName(roomName);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

export class RoomDO implements DurableObject {
  private peers: WebSocket[] = [];
  private pending: string[] = [];
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    if (this.peers.length >= 2) {
      server.close(4001, "Room full");
      return new Response(null, { status: 426, webSocket: client });
    }

    const isFirst = this.peers.length === 0;
    this.peers.push(server);

    server.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      if (this.peers.length < 2) {
        this.pending.push(event.data);
        return;
      }
      for (const peer of this.peers) {
        if (peer !== server && peer.readyState === WebSocket.OPEN) {
          peer.send(event.data);
        }
      }
    });

    server.addEventListener("close", () => {
      this.peers = this.peers.filter((p) => p !== server);
      for (const peer of this.peers) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "peer_disconnected" }));
        }
      }
    });

    if (!isFirst) {
      for (const msg of this.pending) {
        server.send(msg);
      }
      this.pending = [];
      for (const peer of this.peers) {
        peer.send(JSON.stringify({ type: "peer_joined" }));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}
