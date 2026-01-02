import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message } from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private systemPrompt?: string;

  constructor(
    apiKey: string,
    options?: { model?: string; systemPrompt?: string }
  ) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = options?.model ?? "claude-haiku-4-5-20251001";
    this.systemPrompt = options?.systemPrompt;
  }

  async *stream(messages: Message[]): AsyncIterable<string> {
    const response = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      temperature: 0,
      messages,
      system: this.systemPrompt,
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
