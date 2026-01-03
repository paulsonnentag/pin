/// <reference types="vite/client" />
import { createSignal, For, Show, createEffect } from "solid-js";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import type { DocHandle, Repo } from "@automerge/vanillajs";
import type { ChatDoc } from "./types";
import type { Block, DataBlock } from "../llm/types";
import type { BrowserDoc } from "../types";
import { Agent } from "./Agent";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

type SidebarProps = {
  handle: DocHandle<ChatDoc>;
  repo: Repo;
  browserDocHandle: DocHandle<BrowserDoc>;
};

export function Sidebar({ handle, repo, browserDocHandle }: SidebarProps) {
  const doc = makeDocumentProjection(handle);
  const agent = new Agent(handle, API_KEY, repo, browserDocHandle);

  (window as any).currentDocHandle = handle;

  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  let messagesEndRef: HTMLDivElement | undefined;

  // Scroll to bottom when messages change
  createEffect(() => {
    const messages = doc.messages;
    if (messages && messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const handleSend = async () => {
    const text = input().trim();
    if (!text) return;

    setInput("");
    setError(null);

    // Add user message to doc
    handle.change((d: ChatDoc) => {
      if (!d.messages) d.messages = [];
      d.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        blocks: [{ id: crypto.randomUUID(), type: "text", content: text }],
      });
    });

    // Run agent step to generate response
    try {
      await agent.step();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleClear = () => {
    handle.change((d: ChatDoc) => {
      d.messages = [];
    });
    setError(null);
  };

  // Debug logging
  createEffect(() => {
    console.log(
      "[Sidebar] Messages changed, count:",
      doc.messages?.length,
      "ids:",
      doc.messages?.map((m) => m.id)
    );
  });

  return (
    <div class="flex flex-col h-screen font-sans bg-white">
      {/* Header with clear button */}
      <div class="flex items-center justify-end px-4 py-2 border-b border-gray-100">
        <button
          onClick={handleClear}
          disabled={agent.inProgress()}
          class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Clear chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <For each={doc.messages}>
            {(message, msgIdx) => {
              console.log(
                "[Sidebar] Rendering message:",
                message.id,
                "idx:",
                msgIdx()
              );
              return (
                <div class="space-y-1">
                  <Show when={message.role === "user"}>
                    <div class="bg-gray-100 rounded-2xl px-4 py-3">
                      <For each={message.blocks}>
                        {(block) => (
                          <Show when={block.type === "text"}>
                            <p class="text-sm text-gray-900 whitespace-pre-wrap">
                              {(block as Block & { type: "text" }).content}
                            </p>
                          </Show>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={message.role === "assistant"}>
                    <div class="py-2">
                      <For each={message.blocks}>
                        {(block, blockIdx) => (
                          <>
                            <Show when={block.type === "text"}>
                              <p class="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                {(block as Block & { type: "text" }).content}
                              </p>
                            </Show>
                            <Show when={block.type === "data"}>
                              <DataBlockView
                                value={() =>
                                  doc.messages[msgIdx()]?.blocks[
                                    blockIdx()
                                  ] as DataBlock
                                }
                                isStreaming={agent.inProgress}
                              />
                            </Show>
                          </>
                        )}
                      </For>
                      <Show
                        when={message.blocks.length === 0 && agent.inProgress()}
                      >
                        <div class="flex items-center gap-2 text-sm text-gray-400">
                          <div class="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error display */}
      <Show when={error()}>
        <div class="max-w-3xl mx-auto px-4">
          <div class="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error()}
          </div>
        </div>
      </Show>

      {/* Input area */}
      <div class="border-t border-gray-100 bg-white p-4">
        <div class="max-w-3xl mx-auto">
          <div class="flex gap-2 items-end">
            <input
              type="text"
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSend()
              }
              placeholder="Message..."
              class="flex-1 px-4 py-3 text-sm bg-gray-100 border-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-300"
              disabled={agent.inProgress()}
            />
            <button
              onClick={handleSend}
              disabled={agent.inProgress() || !input().trim()}
              class="p-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataBlockView(props: {
  value: () => DataBlock | undefined;
  isStreaming: () => boolean;
}) {
  const block = () => props.value();
  const [isExpanded, setIsExpanded] = createSignal(false);

  // Block is complete when it has result, error, or streaming has stopped
  const isComplete = () => {
    const b = block();
    return b && (b.result !== undefined || b.error !== undefined || !props.isStreaming());
  };

  // Show expanded if streaming or user toggled it open
  const showExpanded = () => !isComplete() || isExpanded();

  // Get the summary text for collapsed state
  const summaryText = () => {
    const b = block();
    if (!b) return "";
    if (b.tag === "script") {
      return b.attributes.description || "Script";
    } else if (b.tag === "file") {
      return b.attributes.name || "File";
    }
    return b.tag;
  };

  // Get tag icon
  const tagIcon = () => {
    const b = block();
    if (!b) return "📦";
    if (b.tag === "script") return "⚡";
    if (b.tag === "file") return "📄";
    return "📦";
  };

  return (
    <div class="my-3">
      <div class="rounded-lg overflow-hidden border border-gray-200">
        {/* Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded())}
          class="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left cursor-pointer"
        >
          <div class="flex items-center gap-2 text-sm">
            <span>{tagIcon()}</span>
            <span class="font-medium text-gray-700">{block()?.tag}</span>
            <span class="text-gray-500">— {summaryText()}</span>
          </div>
          <div class="flex items-center gap-2">
            <Show when={!isComplete()}>
              <div class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </Show>
            <Show when={block()?.result !== undefined}>
              <span class="text-xs text-emerald-600">✓</span>
            </Show>
            <Show when={block()?.error}>
              <span class="text-xs text-red-600">✗</span>
            </Show>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class={`text-gray-400 transition-transform ${showExpanded() ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Content - collapsible */}
        <Show when={showExpanded()}>
          <div class="bg-gray-900">
            <pre class="p-4 text-xs text-gray-100 overflow-x-auto">
              <code>{block()?.content}</code>
            </pre>
          </div>
        </Show>
      </div>

      {/* Result/Error - always visible when present */}
      <Show when={block()?.result !== undefined}>
        <div class="mt-2 p-3 text-xs bg-emerald-50 border border-emerald-200 rounded-lg">
          <span class="font-medium text-emerald-700">Result: </span>
          <code class="text-emerald-800 whitespace-pre-wrap">
            {JSON.stringify(block()?.result, null, 2)}
          </code>
        </div>
      </Show>
      <Show when={block()?.error}>
        <div class="mt-2 p-3 text-xs bg-red-50 border border-red-200 rounded-lg">
          <span class="font-medium text-red-700">Error: </span>
          <code class="text-red-800">{block()?.error}</code>
        </div>
      </Show>
    </div>
  );
}
