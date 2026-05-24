# Whisper — Agents Guide

## What this is

Purely client-side P2P encrypted chat. Two browsers connect via PeerJS signaling → WebRTC DTLS data channel. SAS (Short Authentication String) verification catches MITM even if the signaling server is compromised. All state is in-memory only — zero persistence.

**Authoritative references:** `docs/plan.md` (full spec), `docs/task-plan.md` (implementation breakdown).

## Architecture

```
UI + Session Mgmt → PeerJS signaling → WebRTC DTLS transport (all in browser)
```

Static site only. No backend, no database, no build-time server.

## State machine (hardcoded transitions)

```
LOBBY → AWAITING_PEER → SAS_VERIFY → CHAT_ACTIVE
                          ↘             ↘
                            ABORTED ←─────┘
```

Invalid transitions must be rejected at runtime. `ABORTED → LOBBY` via `session.reset()`.

## Non-negotiable rules

- **Zero persistence**: Never write to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies. Messages live in a JS array only.
- **SAS gate**: Chat must stay locked until user explicitly clicks "Phrases match". No auto-proceed.
- **No timestamps on wire**: `timestamp` is local-only, never sent over `conn.send()`.

## SAS fingerprint flow

1. Extract SHA-256 fingerprint via `conn.peerConnection.getRemoteCertificates()` (primary) or SDP `a=fingerprint:sha-256` fallback (Firefox quirk).
2. Truncate to 44 bits → 4× 11-bit chunks → BIP39 wordlist index.
3. Return `{ phrase: string, degraded: boolean }`. If SDP fallback used, `degraded = true` → show UI indicator.

## PeerJS pattern

- **Host**: `new Peer(roomSecret)` → listen for `connection` event
- **Joiner**: `new Peer()` (ephemeral ID) → `peer.connect(roomSecret)`
- After `DataConnection` `open`, PeerJS broker is out of the loop

## Project tooling

- **Build**: Vite (static, `dist/` output)
- **Language**: TypeScript (strict, DOM lib)
- **Test framework**: none defined yet
- **Deploy**: Netlify or GitHub Pages from `dist/`

## Module map (from task-plan.md)

```
src/
├── main.ts             # Entry: create Session, wire render()
├── state/              # types.ts, machine.ts, session.ts
├── peer/               # client.ts, host.ts, joiner.ts, iceServers.ts
├── sas/                # wordlist.ts, generate.ts
├── ui/                 # render.ts, lobby.ts, awaiting.ts, sasVerify.ts, chat.ts, aborted.ts
└── utils/              # secret.ts, clipboard.ts
```

## Dependencies to install

`peerjs`, `qrcode` (or `qrcodejs`), BIP39 English wordlist (embed as module).

## Firefox known quirk

`getRemoteCertificates()` can return empty. Always fall back to SDP `a=fingerprint` parsing. Mark SAS as `degraded` when fallback is used.
