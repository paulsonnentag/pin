/// <reference types="vite/client" />
import { createSignal, type Accessor } from "solid-js";
import type { DocHandle, Repo } from "@automerge/vanillajs";
import type { ChatDoc, ChatMessage } from "./types";
import type { Block, Message, DataBlock } from "../llm/types";
import type { BrowserDoc } from "../types";
import { AnthropicProvider } from "../llm/anthropic";
import { parseBlocks } from "../llm/parser";
import { runCodeOnPage } from "./evaluateOnPage";
import { createOrUpdateFile } from "./file-handler";
import { SYSTEM_PROMPT } from "./systemPrompt";

/**
 * Agent manages LLM interactions with a chat document.
 * Executes script blocks and creates files, re-runs step if script returns a value.
 */
export class Agent {
  readonly inProgress: Accessor<boolean>;
  private setInProgress: (value: boolean) => void;

  constructor(
    private handle: DocHandle<ChatDoc>,
    private apiKey: string,
    private repo: Repo,
    private browserDocHandle: DocHandle<BrowserDoc>
  ) {
    const [inProgress, setInProgress] = createSignal(false);
    this.inProgress = inProgress;
    this.setInProgress = setInProgress;
  }

  async step(): Promise<void> {
    this.setInProgress(true);
    const assistantMessageId = crypto.randomUUID();

    this.handle.change((d: ChatDoc) => {
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
      const currentDoc = this.handle.doc();
      if (!currentDoc) throw new Error("Document not available");

      const historyForApi = currentDoc.messages.slice(0, -1);
      const stream = provider.stream(toApiMessages(historyForApi));
      const blockIdToIndex = new Map<string, number>();

      for await (const event of parseBlocks(stream)) {
        const blockId = event.block.id;

        this.handle.change((d: ChatDoc) => {
          const msg = d.messages.find((m) => m.id === assistantMessageId);
          if (!msg) return;

          if (event.type === "create") {
            msg.blocks.push({ ...event.block });
            blockIdToIndex.set(blockId, msg.blocks.length - 1);
          } else {
            const idx = blockIdToIndex.get(blockId);
            if (idx !== undefined) msg.blocks[idx] = { ...event.block };
          }
        });

        if (event.type === "complete" && event.block.type === "data") {
          const idx = blockIdToIndex.get(blockId);
          if (idx !== undefined) {
            const result = await this.handleDataBlock(
              assistantMessageId,
              idx,
              event.block
            );
            if (result) shouldRerun = true;
          }
        }
      }
    } catch (err) {
      this.handle.change((d: ChatDoc) => {
        const idx = d.messages.findIndex((m) => m.id === assistantMessageId);
        if (idx !== -1 && d.messages[idx].blocks.length === 0) {
          d.messages.splice(idx, 1);
        }
      });
      throw err;
    } finally {
      this.setInProgress(false);
    }

    if (shouldRerun) await this.step();
  }

  private async handleDataBlock(
    messageId: string,
    blockIdx: number,
    block: DataBlock
  ): Promise<boolean> {
    if (block.tag === "script") {
      return this.executeScript(messageId, blockIdx, block.content);
    } else if (block.tag === "file") {
      await this.createFile(messageId, blockIdx, block);
    }
    return false;
  }

  private async executeScript(
    messageId: string,
    blockIdx: number,
    code: string
  ): Promise<boolean> {
    try {
      const result = await runCodeOnPage(code);
      if (result !== undefined) {
        this.setBlockResult(messageId, blockIdx, result);
        return true;
      }
      return false;
    } catch (err) {
      this.setBlockError(messageId, blockIdx, err);
      return false;
    }
  }

  private async createFile(
    messageId: string,
    blockIdx: number,
    block: DataBlock
  ): Promise<void> {
    const filename = block.attributes.name;
    if (!filename) {
      this.setBlockError(
        messageId,
        blockIdx,
        "File block missing 'name' attribute"
      );
      return;
    }

    try {
      await createOrUpdateFile(
        this.repo,
        this.browserDocHandle,
        filename,
        block.content
      );
      this.setBlockResult(messageId, blockIdx, { created: filename });
    } catch (err) {
      this.setBlockError(messageId, blockIdx, err);
    }
  }

  private setBlockResult(
    messageId: string,
    blockIdx: number,
    result: unknown
  ): void {
    this.handle.change((d: ChatDoc) => {
      const block = d.messages.find((m) => m.id === messageId)?.blocks[
        blockIdx
      ] as DataBlock;
      if (block) block.result = result;
    });
  }

  private setBlockError(
    messageId: string,
    blockIdx: number,
    err: unknown
  ): void {
    this.handle.change((d: ChatDoc) => {
      const block = d.messages.find((m) => m.id === messageId)?.blocks[
        blockIdx
      ] as DataBlock;
      if (block) block.error = err instanceof Error ? err.message : String(err);
    });
  }
}

const toApiMessages = (messages: ChatMessage[]): Message[] =>
  messages.map((msg) => ({
    role: msg.role,
    content: blocksToString(msg.blocks),
  }));

const blocksToString = (blocks: Block[]): string =>
  blocks
    .map((block) => {
      if (block.type === "text") return block.content;

      const attrs = Object.entries(block.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      const openTag = attrs ? `<${block.tag} ${attrs}>` : `<${block.tag}>`;
      let result = `${openTag}\n${block.content}\n</${block.tag}>`;

      if (block.result !== undefined)
        result += `\n[Result: ${JSON.stringify(block.result)}]`;
      if (block.error) result += `\n[Error: ${block.error}]`;
      return result;
    })
    .join("\n");
