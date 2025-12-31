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
};

export type Block = TextBlock | CodeBlock;
