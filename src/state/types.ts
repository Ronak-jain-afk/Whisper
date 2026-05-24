export type AppState =
  | "LOBBY"
  | "AWAITING_PEER"
  | "SAS_VERIFY"
  | "CHAT_ACTIVE"
  | "ABORTED";

export type MessageKind = "text" | "image";

export interface Message {
  id: string;
  kind: MessageKind;
  text: string;
  sender: "self" | "peer";
  timestamp: number;
}
