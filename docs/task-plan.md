# Development Task Plan — Whisper (P2P Encrypted Chat)

> **Goal:** Two peers establish a direct, encrypted communication channel using PeerJS for signaling, verified via SAS comparison. All state is ephemeral.

---

## Phase 0 — Project Scaffolding

| # | Task | Description |
|---|------|-------------|
| 0.1 | **Initialize project with `npm init` and install dependencies** | Run `npm init` and install `peerjs`, `qrcodejs` (or `qrcode`), and the BIP39 English wordlist package. |
| 0.2 | **Configure build tooling (Vite)** | Set up Vite as the bundler. Configure `index.html` entry point, `main.js`/`main.ts` as the script entry. Ensure HMR works. |
| 0.3 | **Create index.html shell** | Single `<div id="app">` container. Include a `<script type="module" src="/src/main.ts">` tag. No server-side logic. |
| 0.4 | **Set up TypeScript config (optional but recommended)** | `tsconfig.json` with strict mode, DOM lib, and module resolution for Vite. |
| 0.5 | **Create source directory structure** | `src/` with subdirectories: `state/`, `peer/`, `sas/`, `ui/`, `utils/`. Placeholder files for each module. |
| 0.6 | **Set up basic CSS/reset** | Minimal CSS reset and a base layout. Dark/light theme variables. Just enough to avoid eye-strain during development. |
| 0.7 | **Verify dev loop** | Run `npm run dev`, confirm blank page loads at `localhost:5173` with no errors. |

---

## Phase 1 — Signaling Prototype (PeerJS Integration)

| # | Task | Description |
|---|------|-------------|
| 1.1 | **Create PeerJS client module (`src/peer/client.ts`)** | Export a function `createPeer(id?: string)` that instantiates a `Peer` with optional ID. Return the `Peer` instance. |
| 1.2 | **Create room host logic (`src/peer/host.ts`)** | Export a function `hostRoom(secret: string): Promise<DataConnection>` that creates a `Peer` with `secret` as the peer ID, listens for `connection`, and resolves with the `DataConnection` once a peer connects. |
| 1.3 | **Create room joiner logic (`src/peer/joiner.ts`)** | Export a function `joinRoom(secret: string): Promise<DataConnection>` that creates a `Peer` with an ephemeral ID, calls `peer.connect(secret)`, and resolves once the connection `open` event fires. |
| 1.4 | **Add error handling for peer ID collision** | Catch PeerJS errors where the ID is already taken. Surface a `PeerIdTakenError` so the UI can prompt the user to generate a new secret. |
| 1.5 | **Add `peer.on('error')` handler** | Log and surface connection-level errors (network failure, broker unreachable, etc.) as structured events. |
| 1.6 | **Test: two tabs manual test** | Create a minimal test page that lets one tab host and another join using a shared string. Verify `DataConnection` `open` fires. |
| 1.7 | **Send a test message over DataConnection** | Once `open`, send a hardcoded string from joiner to host. Log receipt in host's console. |

---

## Phase 2 — SAS Proof-of-Concept

| # | Task | Description |
|---|------|-------------|
| 2.1 | **Extract remote DTLS fingerprint via `getRemoteCertificates()`** | On `DataConnection` open, access `conn.peerConnection.getRemoteCertificates()`. Extract the SHA-256 fingerprint bytes. Handle the case where it's unavailable. |
| 2.2 | **Implement SDP fingerprint fallback** | If `getRemoteCertificates()` returns empty/undefined, parse `conn.peerConnection.remoteDescription.sdp` for the `a=fingerprint:sha-256` line and extract the hex fingerprint string. |
| 2.3 | **Create BIP39 wordlist module (`src/sas/wordlist.ts`)** | Import/embed the BIP39 English wordlist (2048 words). Export as a `const WORDLIST: string[]`. |
| 2.4 | **Implement 44-bit → 4-word mapping (`src/sas/generate.ts`)** | Function `generateSas(fingerprintHex: string): string[]`: parse hex to 32 bytes, truncate to 44 bits (bytes 0–5, mask last byte to 0x0F), split into 4 × 11-bit chunks, map each chunk to `WORDLIST[chunk]`. |
| 2.5 | **Expose 4-word SAS phrase via `conn` metadata exchange** | Both peers independently generate the same SAS phrase (since both see the same DTLS fingerprint). Build a `generateSasPhrase(conn: DataConnection): { phrase: string, degraded: boolean }` function that wraps extraction + generation. |
| 2.6 | **Create a `degraded` flag** | Return `{ phrase, degraded }` where `degraded = true` if the SDP fallback was used. |
| 2.7 | **Test: verify SAS match in two browser tabs** | Open two tabs, host + join, log the SAS phrase in both. Confirm they are identical. Test in both Chrome and Firefox. |

---

## Phase 3 — State Machine

| # | Task | Description |
|---|------|-------------|
| 3.1 | **Define state types (`src/state/types.ts`)** | Union type `AppState = 'LOBBY' | 'AWAITING_PEER' | 'SAS_VERIFY' | 'CHAT_ACTIVE' | 'ABORTED'`. |
| 3.2 | **Define state machine transition interface** | Create `StateMachine` class (or composable) with `current: AppState`, `transition(to: AppState)`, `onEnter(state, cb)`, and guards for invalid transitions. |
| 3.3 | **Define allowed transitions** | LOBBY→AWAITING_PEER, AWAITING_PEER→SAS_VERIFY, SAS_VERIFY→CHAT_ACTIVE, SAS_VERIFY→ABORTED, CHAT_ACTIVE→ABORTED. Reject everything else with a runtime assertion. |
| 3.4 | **Add UI render callback on state change** | Each `transition` call triggers a registered `onRender(state)` callback that re-renders the view. |
| 3.5 | **Implement `reset()` to return to LOBBY** | From ABORTED, allow a reset that clears the Peer instance and message array and reverts to LOBBY. |

---

## Phase 4 — Session Management

| # | Task | Description |
|---|------|-------------|
| 4.1 | **Generate cryptographically strong room secret (`src/utils/secret.ts`)** | `generateSecret(): string`: use `crypto.getRandomValues` to produce 16 random bytes (128 bits), encode as base64url or hex. |
| 4.2 | **Create session orchestrator (`src/state/session.ts`)** | Class `Session` that holds: `peer: Peer | null`, `conn: DataConnection | null`, `stateMachine: StateMachine`, `messages: Message[]`, `secret: string | null`. |
| 4.3 | **Implement `session.createRoom()`** | Generate secret, call `hostRoom(secret)`, start state machine, transition to AWAITING_PEER. |
| 4.4 | **Implement `session.joinRoom(secret: string)`** | Call `joinRoom(secret)`, transition to AWAITING_PEER. |
| 4.5 | **Handle `DataConnection` open → transition to SAS_VERIFY** | In the orchestrator, when `conn.on('open')` fires, call `generateSasPhrase(conn)`, store the phrase, transition to SAS_VERIFY. |
| 4.6 | **Handle SAS match → transition to CHAT_ACTIVE** | `session.confirmSasMatch()`: set `trusted = true`, transition to CHAT_ACTIVE. |
| 4.7 | **Handle SAS mismatch → transition to ABORTED** | `session.rejectSasMatch()`: close connection, transition to ABORTED with reason `'sas_mismatch'`. |
| 4.8 | **Handle connection drop → transition to ABORTED** | `conn.on('close')` and `conn.on('error')` handlers that wipe the message array and transition to ABORTED with reason `'connection_lost'`. |
| 4.9 | **Handle peer ID squat error → return to LOBBY** | Catch `PeerIdTakenError` in `createRoom()`, transition to ABORTED with reason `'id_taken'`. |

---

## Phase 5 — Chat Messaging

| # | Task | Description |
|---|------|-------------|
| 5.1 | **Define Message type (`src/state/types.ts`)** | `interface Message { id: string; text: string; sender: 'self' | 'peer'; timestamp: number }`. (`timestamp` is local-only, never transmitted.) |
| 5.2 | **Implement send message** | `session.sendMessage(text: string)`: push to `messages[]` with `sender: 'self'`, call `conn.send(text)`. |
| 5.3 | **Implement receive message handler** | `conn.on('data')`: push received text to `messages[]` with `sender: 'peer'`, local timestamp. |
| 5.4 | **Implement "Copy conversation" export** | `session.copyConversation()`: serialize `messages[]` to text format, write to clipboard via `navigator.clipboard.writeText()`. |
| 5.5 | **Verify no storage writes** | Add a dev-mode check that `localStorage`, `sessionStorage`, and `IndexedDB` are never written to during a session. Manual audit at Phase 8. |

---

## Phase 6 — UI Components (State-Driven)

| # | Task | Description |
|---|------|-------------|
| 6.1 | **Create render-routing function (`src/ui/render.ts`)** | `render(state: AppState, session: Session)`: switches on state and delegates to `renderLobby()`, `renderAwaitingPeer()`, `renderSasVerify()`, `renderChatActive()`, `renderAborted()`. |
| 6.2 | **Build LOBBY screen** | Title, "Create Room" button, text input + "Join Room" button. Simple, clean layout. |
| 6.3 | **Add QR code display for room secret** | When a room is created, generate and display a QR code of the secret using `qrcode.js`. Include a "Copy" button. |
| 6.4 | **Build AWAITING_PEER screen** | Loading spinner. Display "Waiting for peer to connect…" and the room secret for the host. For the joiner, "Connecting to room…". |
| 6.5 | **Build SAS_VERIFY screen** | Display the 4-word SAS phrase prominently in large text. Two buttons: "✓ Phrases Match" and "✗ Phrases Don't Match". If `degraded`, show a small "⚠ Fingerprint from SDP (degraded)" indicator. |
| 6.6 | **Build CHAT_ACTIVE screen** | Chat bubble UI: scrollable message list, text input at bottom, send button. Show connection status indicator (green dot). Include "Copy conversation" button. |
| 6.7 | **Build ABORTED screen** | Show reason: "Connection lost" / "Security verification failed — possible eavesdropper detected" / "Room ID already taken". "Return to start" button that calls `session.reset()`. |
| 6.8 | **Add connection status indicator** | Green dot when CHAT_ACTIVE and conn is open. Red dot when ABORTED and conn is closed. |

---

## Phase 7 — Resilience & Edge Cases

| # | Task | Description |
|---|------|-------------|
| 7.1 | **Add TURN server config fallback** | Create `src/peer/iceServers.ts` that exports a list of STUN + optional TURN servers. Configure PeerJS to use them. |
| 7.2 | **Handle SAS verification timeout** | If SAS verification is not completed within 5 minutes, auto-transition to ABORTED with reason `'timeout'`. |
| 7.3 | **Message rate limiting** | Prevent sending more than 10 messages/second as a basic spam/burst guard. Silently drop excess messages on the sender side. |
| 7.4 | **Empty message validation** | Block sending empty or whitespace-only messages at the UI level. |
| 7.5 | **Long message truncation** | Truncate messages exceeding 10KB on send to prevent abuse. |
| 7.6 | **Browser tab visibility handling** | If the user switches away for > 30 minutes, show a "session expired" notice and transition to ABORTED. |

---

## Phase 8 — Ephemerality Audit & Storage Verification

| # | Task | Description |
|---|------|-------------|
| 8.1 | **Audit all storage APIs in codebase** | Grep for `localStorage`, `sessionStorage`, `IndexedDB`, `setCookie`, `setInterval` (potential leak). Confirm zero usage. |
| 8.2 | **Verify in-memory message array is wiped on ABORTED** | In `session.reset()`, assert `messages.length === 0` and `conn === null`. |
| 8.3 | **Test: close tab, verify no state recovery** | Open a chat session, send messages, close tab. Reopen the app and confirm no messages, no auto-reconnect, clean LOBBY. |
| 8.4 | **Test: SAS mismatch flow** | Simulate a MITM (e.g., manually spoof fingerprint in dev tools), verify ABORTED screen shows the correct warning and connection is torn down. |

---

## Phase 9 — Polish & Responsive Design

| # | Task | Description |
|---|------|-------------|
| 9.1 | **Responsive layout** | Ensure UI works on mobile (320px width) through desktop. Test viewport, touch targets (min 44px). |
| 9.2 | **Loading states & transitions** | Smooth transitions between screens. Loading spinners for AWAITING_PEER. |
| 9.3 | **Keyboard accessibility** | All interactive elements focusable and activatable via keyboard. Send message on Enter. Escape closes dialogs. |
| 9.4 | **Screen reader support** | ARIA labels on state changes, SAS phrase announced, error messages read out. |
| 9.5 | **Final visual polish** | Consistent spacing, color palette, typography. No visual regressions on any state. |

---

## Phase 10 — Build & Deployment

| # | Task | Description |
|---|------|-------------|
| 10.1 | **Configure Vite production build** | Ensure `npm run build` produces a static bundle in `dist/` with no server-side dependencies. |
| 10.2 | **Deploy to Netlify / GitHub Pages** | Connect repo to Netlify (or configure GitHub Pages). Set publish directory to `dist/`. Verify the deployed site loads. |
| 10.3 | **End-to-end test across two physical devices** | Open the deployed app on two devices. Share secret via QR code scan. Verify SAS phrase matches on both. Send messages. |
| 10.4 | **Write README** | Document: what the app does, metadata tradeoff, self-hosted broker option, browser compatibility, development setup (`npm install`, `npm run dev`, `npm run build`). |
| 10.5 | **Final cleanup** | Remove any leftover debug code, console.logs, test pages. Lint the codebase. |

---

## Appendix: Module Map

```
src/
├── main.ts                  # Entry point: create Session, wire render()
├── state/
│   ├── types.ts             # AppState, Message, SessionData
│   ├── machine.ts           # StateMachine class
│   └── session.ts           # Session orchestrator
├── peer/
│   ├── client.ts            # createPeer()
│   ├── host.ts              # hostRoom()
│   ├── joiner.ts            # joinRoom()
│   └── iceServers.ts        # STUN/TURN config
├── sas/
│   ├── wordlist.ts          # BIP39 wordlist
│   └── generate.ts          # generateSasPhrase()
├── ui/
│   ├── render.ts            # state-based render router
│   ├── lobby.ts             # LOBBY view
│   ├── awaiting.ts          # AWAITING_PEER view
│   ├── sasVerify.ts         # SAS_VERIFY view
│   ├── chat.ts              # CHAT_ACTIVE view
│   └── aborted.ts           # ABORTED view
└── utils/
    ├── secret.ts            # generateSecret()
    └── clipboard.ts         # copyToClipboard()
```
