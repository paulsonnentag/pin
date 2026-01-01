/// <reference types="vite/client" />
import { createSignal, type Accessor } from "solid-js";
import type { DocHandle } from "@automerge/automerge-repo";
import type { SidebarDoc, ChatMessage } from "./types";
import type { Block, Message } from "../llm/types";
import { AnthropicProvider } from "../llm/anthropic";
import { parseBlocks } from "../llm/parser";

/**
 * Agent manages LLM interactions with a chat document.
 * Call step() to generate an assistant response based on current messages.
 */
export class Agent {
  readonly inProgress: Accessor<boolean>;
  private setInProgress: (value: boolean) => void;

  constructor(private handle: DocHandle<SidebarDoc>, private apiKey: string) {
    const [inProgress, setInProgress] = createSignal(false);
    this.inProgress = inProgress;
    this.setInProgress = setInProgress;
  }

  /**
   * Run one step: read current messages, generate assistant response.
   * Creates an assistant message placeholder and streams the LLM response.
   */
  async step(): Promise<void> {
    this.setInProgress(true);

    // Create assistant message placeholder
    const assistantMessageId = crypto.randomUUID();
    this.handle.change((d: SidebarDoc) => {
      if (!d.messages) d.messages = [];
      d.messages.push({
        id: assistantMessageId,
        role: "assistant",
        blocks: [],
      });
    });

    try {
      const provider = new AnthropicProvider(this.apiKey);

      // Get full message history and send to LLM
      const currentDoc = this.handle.doc();
      if (!currentDoc) throw new Error("Document not available");

      // Exclude the empty assistant message we just added
      const historyForApi = currentDoc.messages.slice(0, -1);
      const apiMessages = toApiMessages(historyForApi);

      const stream = provider.stream(apiMessages);

      // Track blocks by ID for updates
      const blockIdToIndex = new Map<string, number>();

      for await (const event of parseBlocks(stream)) {
        this.handle.change((d: SidebarDoc) => {
          const assistantMsg = d.messages.find(
            (m) => m.id === assistantMessageId
          );
          if (!assistantMsg) return;

          if (event.type === "create") {
            // Add new block
            assistantMsg.blocks.push({ ...event.block });
            blockIdToIndex.set(event.blockId, assistantMsg.blocks.length - 1);
          } else if (event.type === "update") {
            // Update existing block
            const idx = blockIdToIndex.get(event.blockId);
            if (idx !== undefined) {
              assistantMsg.blocks[idx] = { ...event.block };
            }
          }
          // "complete" doesn't need special handling - block is already updated
        });
      }
    } catch (err) {
      // Remove the empty assistant message on error
      this.handle.change((d: SidebarDoc) => {
        const idx = d.messages.findIndex((m) => m.id === assistantMessageId);
        if (idx !== -1 && d.messages[idx].blocks.length === 0) {
          d.messages.splice(idx, 1);
        }
      });
      throw err; // Re-throw so caller can handle
    } finally {
      this.setInProgress(false);
    }
  }
}

// Convert chat messages to LLM message format
const toApiMessages = (messages: ChatMessage[]): Message[] => {
  return messages.map((msg) => ({
    role: msg.role,
    content: blocksToString(msg.blocks),
  }));
};

// Serialize blocks to string for LLM API
const blocksToString = (blocks: Block[]): string => {
  return blocks
    .map((block) => {
      if (block.type === "text") {
        return block.content;
      } else {
        const lang = block.language || "";
        return `\`\`\`${lang}\n${block.content}\n\`\`\``;
      }
    })
    .join("\n");
};
