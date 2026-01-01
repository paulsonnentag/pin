import type { Block } from "../llm/types";

// A chat message with structured block content
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
};

// Document type for sidebar chat state
export type SidebarDoc = {
  messages: ChatMessage[];
};
