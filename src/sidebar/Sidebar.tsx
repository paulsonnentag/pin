/// <reference types="vite/client" />
import { createSignal, For, Show, onMount, createEffect } from "solid-js";
import { useDocument } from "@automerge/automerge-repo-solid-primitives";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { repo } from "./repo";
import type { SidebarDoc, ChatMessage } from "./types";
import type { Block, Message } from "../llm/types";
import { AnthropicProvider } from "../llm/anthropic";
import { parseBlocks } from "../llm/parser";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

export function Sidebar(props: { docUrl: AutomergeUrl }) {
  const [doc, handle] = useDocument<SidebarDoc>(() => props.docUrl, { repo });

  const [input, setInput] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let messagesEndRef: HTMLDivElement | undefined;

  // Scroll to bottom when messages change
  createEffect(() => {
    const messages = doc()?.messages;
    if (messages && messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const handleSend = async () => {
    const text = input().trim();
    if (!text) return;

    const h = handle();
    if (!h) return;

    setInput("");
    setLoading(true);
    setError(null);

    // Create user message
    const userMessageId = crypto.randomUUID();
    h.change((d: SidebarDoc) => {
      if (!d.messages) d.messages = [];
      d.messages.push({
        id: userMessageId,
        role: "user",
        blocks: [{ type: "text", content: text }],
      });
    });

    // Create assistant message placeholder
    const assistantMessageId = crypto.randomUUID();
    h.change((d: SidebarDoc) => {
      d.messages.push({
        id: assistantMessageId,
        role: "assistant",
        blocks: [],
      });
    });

    try {
      const provider = new AnthropicProvider(API_KEY);

      // Get full message history and send to LLM
      const currentDoc = h.doc();
      if (!currentDoc) throw new Error("Document not available");

      // Exclude the empty assistant message we just added
      const historyForApi = currentDoc.messages.slice(0, -1);
      const apiMessages = toApiMessages(historyForApi);

      const stream = provider.stream(apiMessages);

      // Track blocks by ID for updates
      const blockIdToIndex = new Map<string, number>();

      for await (const event of parseBlocks(stream)) {
        h.change((d: SidebarDoc) => {
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
      setError(String(err));
      // Remove the empty assistant message on error
      h.change((d: SidebarDoc) => {
        const idx = d.messages.findIndex((m) => m.id === assistantMessageId);
        if (idx !== -1 && d.messages[idx].blocks.length === 0) {
          d.messages.splice(idx, 1);
        }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex flex-col h-screen font-sans bg-gray-50">
      {/* Messages area */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <For each={doc()?.messages}>
          {(message) => (
            <div
              class={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                class={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                <For each={message.blocks}>
                  {(block) => (
                    <Show
                      when={block.type === "text"}
                      fallback={
                        <pre
                          class={`text-xs p-2 rounded mt-2 overflow-x-auto ${
                            message.role === "user"
                              ? "bg-blue-600"
                              : "bg-gray-100"
                          }`}
                        >
                          <code>
                            {(block as Block & { type: "code" }).content}
                          </code>
                        </pre>
                      }
                    >
                      <p class="text-sm whitespace-pre-wrap">
                        {(block as Block & { type: "text" }).content}
                      </p>
                    </Show>
                  )}
                </For>
                <Show when={message.blocks.length === 0 && loading()}>
                  <div class="flex items-center gap-2 text-sm text-gray-400">
                    <div class="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    Thinking...
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      <Show when={error()}>
        <div class="mx-4 p-3 text-sm text-red-700 bg-red-100 rounded">
          {error()}
        </div>
      </Show>

      {/* Input area */}
      <div class="border-t border-gray-200 bg-white p-4">
        <div class="flex gap-2">
          <input
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading()}
          />
          <button
            onClick={handleSend}
            disabled={loading() || !input().trim()}
            class="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// Convert chat messages to LLM message format
function toApiMessages(messages: ChatMessage[]): Message[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: blocksToString(msg.blocks),
  }));
}

// Serialize blocks to string for LLM API
function blocksToString(blocks: Block[]): string {
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
}
