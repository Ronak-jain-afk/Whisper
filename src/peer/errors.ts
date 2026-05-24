export class PeerIdTakenError extends Error {
  constructor(secret: string) {
    super(`Peer ID "${secret}" is already taken`);
    this.name = "PeerIdTakenError";
  }
}

export class PeerConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PeerConnectionError";
  }
}
