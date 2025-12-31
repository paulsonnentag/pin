import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message } from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async *stream(messages: Message[]): AsyncIterable<string> {
    const response = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      messages,
    });

    for await (const event of response) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}
