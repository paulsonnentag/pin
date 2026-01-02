export type Message = {
  role: "user" | "assistant";
  content: string;
};

export interface LLMProvider {
  stream(messages: Message[]): AsyncIterable<string>;
}

export type TextBlock = {
  type: "text";
  content: string;
};

export type CodeBlock = {
  type: "code";
  language: string | null;
  content: string;
  result?: unknown; // JSON-serializable result from execution
  error?: string; // Error message if execution failed
};

export type Block = TextBlock | CodeBlock;

export type BlockEvent = {
  type: "create" | "update" | "complete";
  blockId: string;
  block: Block;
};
