# Whisper

A browser-to-browser encrypted chat that doesn't rely on a central server. Two people connect directly over WebRTC after a quick signaling handshake via PeerJS. A short authentication string (SAS) comparison makes sure no one is eavesdropping, even if the signaling server were compromised.

Everything lives in memory. Close the tab and it's gone.

## How it works

1. One person creates a room. The app generates a random 128-bit secret.
2. That secret is shared with the other person -- copy-paste, QR code, however you want.
3. PeerJS handles the signaling handshake through its public broker. Once that's done, the two browsers connect directly over WebRTC DTLS.
4. Both sides independently compute a 4-word SAS phrase from both peers' DTLS certificate fingerprints. You compare these out of band (call, text, in person) to catch MITM.
5. If the phrases match, the chat unlocks. An AES-256-GCM key is derived from the room secret via PBKDF2, and all subsequent messages are encrypted end-to-end before they ever touch the DataChannel.

## Features

- Room creation and joining with a 128-bit shared secret
- QR code sharing for the secret
- SAS verification with BIP39 wordlist (4 words, 44 bits from both certificates)
- Text, image, and file messaging over the encrypted channel
- Image upload auto-resizes and compresses (max 400px, JPEG quality 0.4)
- File sharing up to 250 KB per file (any type)
- E2E encryption with AES-256-GCM + PBKDF2 (key derived from room secret)
- Emoji picker (32 emojis, cursor-aware insertion)
- Message search (live text filter, case-insensitive)
- Scroll-to-bottom button
- Sent indicator (checkmark on self messages)
- Typing indicator (animated dots)
- Notification sound on new peer messages (Web Audio API, 800 Hz chime)
- Copy conversation to clipboard with confirmation
- Rate limiting (10 messages per second)
- Idle timeout (30 minutes of hidden tab) and SAS timeout (5 minutes)
- Connection timeout (30 seconds)
- Firefox support (SDP fingerprint fallback when certificate APIs are unavailable)

## Running it

```
npm install
npm run dev       # dev server at localhost:5173
npm run build     # production build goes to dist/
npm run preview   # preview the production build
```

## Deploying

### Cloudflare Pages

1. Push the repo to GitHub.
2. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
3. Select your repo, set the build command to `npm run build` and the build output directory to `dist`.
4. Deploy. Security headers are configured in `public/_headers`.

### Other static hosts

It's a static site. Drop `dist/` on any static host (Netlify, Vercel, GitHub Pages). No server-side config needed.

## What the signaling server sees

The PeerJS public broker sees IP addresses, timing, and the room identifier. It does not see message content (DTLS + E2E AES-GCM encryption prevent that) and it cannot silently intercept the connection (SAS verification catches MITM). This is fine for a personal project. If you need stronger guarantees, you can swap in a self-hosted PeerJS server or a Nostr relay.

## Browser support

Chrome, Edge, Firefox, and Safari -- modern versions only.

## License

MIT
