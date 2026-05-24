import type { AppState } from "./types";

const ALLOWED_TRANSITIONS: Record<AppState, AppState[]> = {
  LOBBY: ["AWAITING_PEER"],
  AWAITING_PEER: ["SAS_VERIFY", "ABORTED"],
  SAS_VERIFY: ["CHAT_ACTIVE", "ABORTED"],
  CHAT_ACTIVE: ["ABORTED"],
  ABORTED: [],
};

type StateListener = (state: AppState, prev: AppState) => void;

export class StateMachine {
  private _current: AppState;
  private listeners: StateListener[] = [];

  constructor(initial: AppState = "LOBBY") {
    this._current = initial;
  }

  get current(): AppState {
    return this._current;
  }

  transition(to: AppState): void {
    const allowed = ALLOWED_TRANSITIONS[this._current];
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid transition: ${this._current} → ${to}`
      );
    }
    const prev = this._current;
    this._current = to;
    for (const cb of this.listeners) {
      cb(to, prev);
    }
  }

  onTransition(cb: StateListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  reset(): void {
    this._current = "LOBBY";
  }
}
