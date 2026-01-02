/// <reference types="vite/client" />
import { createSignal, type Accessor } from "solid-js";
import type { DocHandle } from "@automerge/automerge-repo";
import type { SidebarDoc, ChatMessage } from "./types";
import type { Block, Message, CodeBlock } from "../llm/types";
import { AnthropicProvider } from "../llm/anthropic";
import { parseBlocks } from "../llm/parser";
import { runCodeOnPage } from "./evaluateOnPage";
import { SYSTEM_PROMPT } from "./systemPrompt";

/**
 * Agent manages LLM interactions with a chat document.
 * Call step() to generate an assistant response based on current messages.
 * Executes JS code blocks and re-runs step if code returns a value.
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
   * Executes JS code blocks and re-runs if code was executed.
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

    let shouldRerun = false;

    try {
      const provider = new AnthropicProvider(this.apiKey, {
        systemPrompt: SYSTEM_PROMPT,
      });

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
          if (!assistantMsg) {
            return;
          }

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
        });

        // Execute JS code blocks when complete
        const isJsCode =
          event.block.type === "code" &&
          (event.block.language === "js" ||
            event.block.language === "javascript");

        if (event.type === "complete" && isJsCode) {
          const blockIdx = blockIdToIndex.get(event.blockId);
          if (blockIdx !== undefined) {
            const hasResult = await this.executeCodeBlock(
              assistantMessageId,
              blockIdx,
              event.block.content
            );
            // Only rerun if code returned a value
            if (hasResult) {
              shouldRerun = true;
            }
          }
        }
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

    // Re-run step if code was executed so LLM can see results
    if (shouldRerun) {
      await this.step();
    }
  }

  /**
   * Execute a JS code block and store the result/error in the document.
   * Returns true if the code returned a non-undefined value.
   */
  private async executeCodeBlock(
    messageId: string,
    blockIdx: number,
    code: string
  ): Promise<boolean> {
    try {
      const result = await runCodeOnPage(code);

      // Only store and signal rerun if result is not undefined
      if (result !== undefined) {
        this.handle.change((d: SidebarDoc) => {
          const msg = d.messages.find((m) => m.id === messageId);
          if (msg && msg.blocks[blockIdx]) {
            const block = msg.blocks[blockIdx] as CodeBlock;
            block.result = result;
          }
        });
        return true;
      }
      return false;
    } catch (err) {
      // Store error in the block
      this.handle.change((d: SidebarDoc) => {
        const msg = d.messages.find((m) => m.id === messageId);
        if (msg && msg.blocks[blockIdx]) {
          const block = msg.blocks[blockIdx] as CodeBlock;
          block.error = err instanceof Error ? err.message : String(err);
        }
      });
      return false;
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
        let result = `\`\`\`${lang}\n${block.content}\n\`\`\``;
        // Include execution results if present
        if (block.result !== undefined) {
          result += `\n[Result: ${JSON.stringify(block.result)}]`;
        }
        if (block.error) {
          result += `\n[Error: ${block.error}]`;
        }
        return result;
      }
    })
    .join("\n");
};
