/// <reference types="vite/client" />
import { createSignal, For, Show, createEffect } from "solid-js";
import { makeDocumentProjection } from "@automerge/automerge-repo-solid-primitives";
import type { DocHandle } from "@automerge/automerge-repo";
import type { SidebarDoc } from "./types";
import type { Block } from "../llm/types";
import { Agent } from "./Agent";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

type SidebarProps = {
  handle: DocHandle<SidebarDoc>;
};

export function Sidebar({ handle }: SidebarProps) {
  const doc = makeDocumentProjection(handle);
  const agent = new Agent(handle, API_KEY);

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
    handle.change((d: SidebarDoc) => {
      if (!d.messages) d.messages = [];
      d.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        blocks: [{ type: "text", content: text }],
      });
    });

    // Run agent step to generate response
    try {
      await agent.step();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div class="flex flex-col h-screen font-sans bg-gray-50">
      {/* Messages area */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <For each={doc.messages}>
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
                <Show when={message.blocks.length === 0 && agent.inProgress()}>
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
            disabled={agent.inProgress()}
          />
          <button
            onClick={handleSend}
            disabled={agent.inProgress() || !input().trim()}
            class="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
