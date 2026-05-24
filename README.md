# Whisper

A browser-to-browser encrypted chat that doesn't rely on a central server. Two people connect directly over WebRTC after a quick signaling handshake via PeerJS. A short authentication string (SAS) comparison makes sure no one is eavesdropping, even if the signaling server were compromised.

Everything lives in memory. Close the tab and it's gone.

## How it works

1. One person creates a room. The app generates a random 128-bit secret.
2. That secret is shared with the other person -- copy-paste, QR code, however you want.
3. PeerJS handles the signaling handshake through its public broker. Once that's done, the two browsers connect directly.
4. Both sides independently compute a 4-word phrase from the DTLS fingerprint. You compare these out of band (call, text, in person) to make sure no one is in the middle.
5. If the phrases match, the chat unlocks. All messages go over the WebRTC data channel encrypted with DTLS. No server touches them.

## What's here

The project is in active development. Current features:

- Room creation and joining with a shared secret
- QR code sharing for the secret
- SAS verification with BIP39 wordlist (4 words, 44 bits of fingerprint)
- Text and image messaging over the encrypted channel
- Rate limiting (10 messages per second)
- Idle timeout (30 minutes of hidden tab) and SAS timeout (5 minutes)
- Firefox works -- uses SDP fingerprint fallback when certificate APIs aren't available

## Running it

```
npm install
npm run dev       # dev server at localhost:5173
npm run build     # production build goes to dist/
npm run preview   # preview the production build
```

## Deploying

It's a static site. Drop `dist/` on Netlify, GitHub Pages, or any static host. A `netlify.toml` is included with security headers if you want to use Netlify directly.

## What the signaling server sees

The PeerJS public broker sees IP addresses, timing, and the room identifier. It does not see message content (DTLS prevents that) and it cannot silently intercept the connection (SAS verification catches MITM). This is fine for a personal project. If you need stronger guarantees, you can swap in a self-hosted PeerJS server or a Nostr relay.

## Browser support

Chrome, Edge, Firefox, and Safari -- modern versions only.

## License

MIT
