## 1. System Overview & Core Principles

**Goal:** Two peers establish a direct, encrypted communication channel using PeerJS for signaling. The connection is mutually verified to prevent man-in-the-middle attacks. All chat state is ephemeral, existing only in the browser's RAM, and is destroyed when the tab is closed.

**Non‑negotiable properties:**
- **Confidentiality:** All messages are end‑to‑end encrypted in transit via DTLS.
- **Authentication:** Users cryptographically verify they are connected directly to each other via SAS comparison, defeating any MITM even if the signaling server is compromised.
- **Zero persistence:** No message history, logs, or metadata are stored on any device after the session ends.
- **Zero‑cost maintenance:** The developer hosts nothing but a static web page. PeerJS's free public server handles signaling only — it never sees message content.
- **Pragmatic decentralization:** Signaling is delegated to a trusted-but-untrusted third party. The SAS verification step ensures that even a fully compromised signaling server cannot silently intercept the connection.

**Accepted tradeoff:**
The PeerJS signaling server can observe metadata: the IP addresses of both peers, session timing, and the room identifier. It cannot read message content or perform an undetected MITM. This is an acceptable risk for a personal project. For a higher threat model, the signaling layer could be swapped for a self-hosted server or a Nostr relay without changing any other layer of the system.

---

## 2. High‑Level Architecture

The system consists of three loosely coupled layers:

### Layer A – Application UI & Session Management
- Handles user interaction (room creation, joining, security verification, messaging).
- Orchestrates the lifecycle of a chat session.
- Purely client‑side, statically hosted (Netlify / GitHub Pages).

### Layer B – Signaling via PeerJS
- Uses the PeerJS library and its free public broker server as a rendezvous point.
- Converts a shared room identifier (secret string) into a PeerJS peer ID.
- Allows peers to exchange WebRTC session descriptors (offers, answers, ICE candidates) without any custom backend code.

### Layer C – Secure Peer‑to‑Peer Transport
- Establishes a direct WebRTC data channel between the two browsers.
- Leverages DTLS for transport encryption (mandatory in WebRTC).
- Implements an additional **Short Authentication String (SAS)** verification step on top of the native encryption to defeat MITM — even one performed by a compromised signaling server.

---

## 3. Detailed Component Logic

### 3.1 Room Lifecycle & Identifiers

**Room creation:**
1. When User A clicks "Create Room", the application generates a cryptographically strong **room secret** (128 bits of entropy, encoded as a hex or base64 string).
2. This secret is used directly as the PeerJS peer ID that User A registers with the broker.
3. User A shares the secret with User B via any external channel (copy‑paste, QR code, spoken aloud, etc.).

**Room joining:**
- User B inputs the room secret, which the app uses to call `peer.connect(roomSecret)` — targeting User A's registered peer ID directly.

**Security note:** The room secret must be unpredictable (high entropy) to prevent an attacker from guessing it and registering the peer ID before User A does (a "squat" attack). 128 bits of entropy makes this computationally infeasible. The secret is a rendezvous address, not a cryptographic key — but it must be treated as a shared secret between the two users.

---

### 3.2 Signaling via PeerJS

**What PeerJS does:**
- Provides a lightweight abstraction over WebRTC signaling.
- Connects to a public broker server over WebSocket to exchange SDP offers, answers, and ICE candidates between two peers identified by their peer IDs.
- Once the WebRTC data channel is established, PeerJS's broker is no longer in the communication path.

**What the PeerJS broker can observe (accepted metadata risk):**
- The IP address of each peer at connection time.
- The peer ID (room secret) used for rendezvous.
- Session duration (inferred from WebSocket connect/disconnect events).

**What the PeerJS broker cannot do:**
- Read any message content (protected by DTLS).
- Perform an undetected MITM (caught by SAS verification — see §3.4).

**Integration sketch:**
```javascript
// User A (host)
const peer = new Peer(roomSecret, { /* PeerJS config */ });
peer.on('connection', (conn) => handleIncomingConnection(conn));

// User B (joiner)
const peer = new Peer(); // random ephemeral ID for B
const conn = peer.connect(roomSecret);
conn.on('open', () => handleConnectionOpen(conn));
```

**STUN/TURN configuration:**
- PeerJS uses Google's public STUN servers by default for NAT traversal.
- Optionally add a free TURN server (e.g., Metered.ca free tier) as a fallback for symmetric NAT situations. This is a config entry only — no server to maintain.

---

### 3.3 Peer Connection Establishment (WebRTC)

PeerJS handles the signaling internally. The application logic only needs to handle the resulting data channel:

1. **User A** creates a `Peer` with the room secret as its ID and listens for incoming connections.
2. **User B** creates a `Peer` with an ephemeral ID and calls `peer.connect(roomSecret)`.
3. PeerJS exchanges SDP offer/answer and ICE candidates over its broker WebSocket.
4. When ICE completes, a direct DTLS-encrypted data channel exists between the two browsers.
5. The app receives a `DataConnection` object and transitions to the SAS verification state.

**Important:** After this point, the PeerJS broker is completely out of the loop. All subsequent communication, including SAS verification messages and chat messages, flows directly peer-to-peer.

---

### 3.4 Security Verification – SAS (Short Authentication String)

This is the critical layer that makes the PeerJS signaling server untrusted-but-acceptable. Even if the broker is fully compromised and injects a MITM, the SAS step will detect it.

**Logic:**

1. **Fingerprint extraction:** Once the data channel opens, each peer extracts the **remote DTLS certificate fingerprint** from the underlying `RTCPeerConnection`.
   - Accessed via `conn.peerConnection.getRemoteCertificates()` or parsed from the remote SDP's `a=fingerprint` line as a fallback.
   - This fingerprint is a SHA-256 hash of the self-signed certificate the remote browser used during DTLS handshake.

2. **Fallback (cross-browser):** If `getRemoteCertificates()` is unavailable or returns empty (a known Firefox quirk), parse the `a=fingerprint:sha-256 XX:XX:...` attribute from the remote SDP string. This is less ideal (it's what the remote *claimed*, not what was *observed*) but acceptable as a degraded fallback with a UI warning.

3. **SAS generation:**
   - Take the raw fingerprint bytes (32 bytes from SHA-256).
   - Truncate to 44 bits.
   - Map each 11-bit chunk to a word from the BIP39 wordlist (2048 words), producing a **4-word phrase**.
   - Example output: `"river tandem surplus clock"`

4. **Out‑of‑band comparison:**
   - Both screens display the 4-word phrase prominently.
   - Users verbally confirm (phone call, video call, in-person) that both phrases match exactly.
   - The UI should make it impossible to proceed without explicitly clicking "Phrases match" or "Phrases don't match".

5. **Decision:**
   - **Match** → No MITM present. The chat interface is unlocked.
   - **Mismatch** → MITM detected. Connection is torn down immediately. Return to LOBBY with an explicit warning.

**Why a compromised PeerJS server cannot defeat this:**
A MITM attacker would need to terminate two separate DTLS sessions — one with each peer — and proxy between them. Each peer would then see the *attacker's* certificate fingerprint, not their intended peer's. The SAS phrases on both screens would differ, and both users would see the mismatch.

---

### 3.5 Chat Messaging and Ephemerality

Once SAS verification is complete:

- **Message format:** Plain UTF-8 strings. No metadata attached (no timestamps sent over the wire, timestamps are generated locally for display only).
- **Transmission:** Sent over the PeerJS `DataConnection`, which wraps the DTLS-encrypted WebRTC data channel. No additional application-layer encryption is needed for confidentiality in transit.
- **No storage:** Messages are kept only in a JavaScript array in memory, rendered to the DOM. No writes to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies — ever.
- **Optional escape hatch:** A "Copy conversation" button allows a deliberate, user-triggered export to clipboard before closing. This does not violate zero-persistence (no automatic writes) and is more honest than pretending users will never want to save anything.
- **Destruction:** Closing the tab frees all memory. There is no session recovery.

---

## 4. State Machine & User Flow

### 4.1 Application States

- **`LOBBY`** – Initial screen; options to create or join a room.
- **`AWAITING_PEER`** – Room created/joined; waiting for PeerJS to establish the data channel.
- **`SAS_VERIFY`** – Data channel open; SAS phrase displayed; waiting for user confirmation.
- **`CHAT_ACTIVE`** – SAS verified; messaging interface active.
- **`ABORTED`** – Connection refused during SAS check, or connection lost.

### 4.2 State Transitions

1. **`LOBBY` → `AWAITING_PEER`**
   *Trigger:* User creates or joins a room.
   *Action:* Instantiate `Peer`; register peer ID (host) or call `peer.connect()` (joiner); display room secret + QR code for sharing (host only).

2. **`AWAITING_PEER` → `SAS_VERIFY`**
   *Trigger:* PeerJS `DataConnection` `open` event fires.
   *Action:* Extract remote DTLS fingerprint; generate SAS phrase; render verification UI.

3. **`SAS_VERIFY` → `CHAT_ACTIVE`**
   *Trigger:* User clicks "Phrases match".
   *Action:* Mark peer as trusted; render chat interface; enable sending.

4. **`SAS_VERIFY` → `ABORTED`**
   *Trigger:* User clicks "Phrases don't match", or connection drops before confirmation.
   *Action:* Call `conn.close()`; return to `LOBBY` with warning message.

5. **`CHAT_ACTIVE` → `ABORTED`**
   *Trigger:* Data channel `close` event (peer disconnected, tab closed, network loss).
   *Action:* Display disconnection notice; free in-memory chat array; offer return to `LOBBY`.

---

## 5. Data Flow Diagram (Textual)

```
[User A]                    [PeerJS Broker]                   [User B]
   |                               |                              |
   |-- register(roomSecret) ------>|                              |
   |                               |<-- connect(roomSecret) ------|
   |                               |--- relay SDP offer --------->|
   |                               |<-- relay SDP answer ---------|
   |                               |--- relay ICE candidates ---->|
   |                               |<-- relay ICE candidates -----|
   |                               |                              |
   |<========= Direct DTLS-encrypted WebRTC data channel =======>|
   |                (PeerJS broker no longer involved)            |
   |                               |                              |
   |--- [SAS: "river tandem ..."]  |  [SAS: "river tandem ..."] --|
   |--- voice/video comparison ----|------------------------------|
   |--- click "Match" -------------|                              |
   |                               |              click "Match" --|
   |                               |                              |
   |<========= Verified, trusted data channel ==================>|
   |--- "hey" ---------------------------------------------------->|
   |<--- "hey yourself" ------------------------------------------|
   |                               |                              |
[Tab closed — all memory freed]
```

---

## 6. Resilience & Edge Cases

### NAT Traversal & Connectivity
- PeerJS uses Google's STUN servers by default. Works for most NAT types.
- For symmetric NAT (rare, typically corporate networks): add a free TURN server config entry. No maintenance required.

### Peer ID Squatting
- If an attacker registers the room secret as a peer ID before User A, User A's registration will fail with a PeerJS error. Handle this explicitly: show an error like "Room ID already taken — generate a new one." The 128-bit secret space makes accidental collision negligible; only a targeted attack (knowing the secret in advance) could cause this.

### SAS Fingerprint Fallback
- If `getRemoteCertificates()` returns empty: fall back to parsing the `a=fingerprint` line from the remote SDP.
- Display a subtle UI indicator: "⚠ Fingerprint from SDP (degraded)" so users know the verification is slightly weaker.
- This covers Firefox, which has historically had issues with `getRemoteCertificates()`.

### Unexpected Disconnection
- Monitor `conn.on('close')` and `conn.on('error')`.
- On disconnect: immediately wipe the in-memory message array and show a "Connection lost — session ended" screen.
- Do not attempt automatic reconnection (it would require a new SAS verification cycle anyway).

### PeerJS Broker Downtime
- The free PeerJS broker has no SLA. For resilience, consider self-hosting the open-source `peerjs-server` on a free-tier platform (Render, Railway) as a fallback, or configuring a secondary broker in the PeerJS options.
- Document this as a known fragility in the README.

---

## 7. Non‑Functional Requirements

- **Performance:** PeerJS signaling typically completes in 1–3 seconds on a good network. No DHT bootstrapping delay.
- **Bandwidth:** Near-zero overhead after connection. Chat messages have no additional framing beyond the WebRTC data channel.
- **Offline:** Requires internet for initial signaling. Once the data channel is open, a brief network interruption may be tolerated by ICE but will likely close the connection.
- **Browser compatibility:** Chrome, Edge, Firefox, Safari (modern versions). SAS fallback covers Firefox's `getRemoteCertificates()` quirk.
- **Bundle size:** PeerJS is ~45KB gzipped. The BIP39 wordlist is ~80KB. Total page weight is well under 200KB excluding UI assets.

---

## 8. Implementation Roadmap

### Phase 1 – Signaling prototype
- Integrate PeerJS on a bare HTML page.
- Validate that two browser tabs can discover each other using a shared peer ID string.
- Confirm the `DataConnection` `open` event fires and basic string messages pass through.
- **Exit criterion:** Two tabs, one shared string, messages flowing. Nothing else.

### Phase 2 – SAS proof-of-concept *(de-risk first)*
- On data channel open, call `getRemoteCertificates()` in Chrome and inspect the result.
- Test the SDP `a=fingerprint` fallback in Firefox.
- Implement the 44-bit truncation → BIP39 word mapping.
- Display the 4-word phrase in both tabs and verify they match under normal conditions.
- **Exit criterion:** SAS phrase is displayed and correct before writing any chat UI.

### Phase 3 – State machine + UI
- Wire Phase 1 and Phase 2 together behind the five-state machine.
- Build the LOBBY, AWAITING_PEER, SAS_VERIFY, and CHAT_ACTIVE screens.
- Add QR code generation for the room secret (use `qrcode.js`).
- **Exit criterion:** Full user flow works end-to-end in two browser windows.

### Phase 4 – Ephemerality verification + edge cases
- Audit for any storage leaks (`localStorage`, `sessionStorage`, `IndexedDB`).
- Handle disconnection, peer ID squat, and SAS mismatch flows with appropriate UI.
- Add the optional "Copy conversation" clipboard export button.
- **Exit criterion:** No data persists after tab close; error states are handled gracefully.

### Phase 5 – Polish + deployment
- Responsive layout, connection status indicators, loading states.
- Deploy static bundle to Netlify or GitHub Pages.
- End-to-end test with a second physical device, including SAS phrase comparison over a voice call.
- Document the metadata tradeoff and the self-hosted broker option in the README.