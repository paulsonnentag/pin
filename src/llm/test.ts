/// <reference types="vite/client" />
import { AnthropicProvider } from "./anthropic";
import { parseBlocks } from "./parser";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
const provider = new AnthropicProvider(apiKey);

const messages = [
  { role: "user" as const, content: "Write a hello world in Python" },
];

async function main() {
  console.log("\n\n=== Parsed blocks ===\n");

  for await (const block of parseBlocks(provider.stream(messages))) {
    if (block.type === "text") {
      console.log("[TEXT]", block.content);
    } else {
      console.log(`[CODE lang=${block.language}]`);
      console.log(block.content);
      console.log("[/CODE]");
    }
  }
}

main().catch(console.error);
