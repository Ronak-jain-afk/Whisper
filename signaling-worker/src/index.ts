export interface Env {
  ROOM: DurableObjectNamespace;
  TURN_TOKEN_ID?: string;
  TURN_TOKEN_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/turn-credentials" || path === "/turn-credentials/") {
      return handleTurnCredentials(env);
    }

    const roomName = path.replace(/^\/room\//, "");
    if (!roomName) {
      return new Response("Use /room/<secret>", { status: 400 });
    }
    const id = env.ROOM.idFromName(roomName);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

async function handleTurnCredentials(env: Env): Promise<Response> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!env.TURN_TOKEN_ID || !env.TURN_TOKEN_SECRET) {
    return new Response(JSON.stringify({ error: "TURN not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_TOKEN_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_TOKEN_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: text }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    const data = (await res.json()) as { iceServers: unknown };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }
}

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
