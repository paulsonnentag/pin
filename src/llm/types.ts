export type Message = {
  role: "user" | "assistant";
  content: string;
};

export interface LLMProvider {
  stream(messages: Message[]): AsyncIterable<string>;
}

export type TextBlock = {
  type: "text";
  id: string;
  content: string;
};

export type DataBlock = {
  type: "data";
  id: string;
  tag: string;
  attributes: Record<string, string>;
  content: string;
  result?: unknown;
  error?: string;
};

export type Block = TextBlock | DataBlock;

export type BlockEvent = {
  type: "create" | "update" | "complete";
  block: Block;
};
