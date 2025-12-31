/// <reference types="vite/client" />
import { createSignal, For, Show } from "solid-js";
import { useDocument } from "@automerge/automerge-repo-solid-primitives";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import browser from "webextension-polyfill";
import { repo } from "./repo";
import type { SidebarDoc, Match } from "./types";
import { AnthropicProvider } from "../llm/anthropic";
import { parseBlocks } from "../llm/parser";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

export function Sidebar(props: { docUrl: AutomergeUrl }) {
  const [doc, handle] = useDocument<SidebarDoc>(() => props.docUrl, { repo });

  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleSearch = async () => {
    const searchQuery = query().trim();
    if (!searchQuery) return;

    const h = handle();
    if (!h) return;

    setLoading(true);
    setError(null);

    // Clear existing matches
    h.change((d: SidebarDoc) => {
      d.matches = [];
    });

    try {
      const pageText = await getPageText();
      const provider = new AnthropicProvider(apiKey);

      const prompt = `You are analyzing a webpage to find items matching a user's search query.

User is searching for: "${searchQuery}"

Here is the text content of the webpage:
---
${pageText.slice(0, 50000)}
---

Find all items on this page that match the search query "${searchQuery}". 
For each match, output a JSON code block with the extracted information.

Each code block should be valid JSON with relevant fields extracted from the page.
For example, if searching for "flights", each match might have fields like:
- airline, departure, arrival, price, duration, etc.

Output each match as a separate \`\`\`json code block.
Only output the JSON code blocks, no other text.`;

      const messages = [{ role: "user" as const, content: prompt }];
      const stream = provider.stream(messages);

      for await (const block of parseBlocks(stream)) {
        if (block.type === "code" && block.language === "json") {
          try {
            const match = JSON.parse(block.content) as Match;
            h.change((d: SidebarDoc) => {
              d.matches.push(match);
            });
          } catch (e) {
            console.warn("Failed to parse JSON block:", block.content);
          }
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="p-4 font-sans">
      <div class="flex gap-2 mb-4">
        <input
          type="text"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search for... (e.g., flights, hotels)"
          class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading()}
        />
        <button
          onClick={handleSearch}
          disabled={loading() || !query().trim()}
          class="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading() ? "Searching..." : "Search"}
        </button>
      </div>

      <Show when={error()}>
        <div class="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Analyzing page...
        </div>
      </Show>

      <Show when={doc()?.matches.length}>
        <div class="space-y-3">
          <h2 class="text-sm font-semibold text-gray-700">
            Found {doc()?.matches.length} matches
          </h2>
          <For each={doc()?.matches}>
            {(match) => (
              <div class="p-3 bg-gray-50 rounded border border-gray-200">
                <pre class="text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(match, null, 2)}
                </pre>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

async function getPageText(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");

  return browser.tabs.sendMessage(
    tab.id,
    { type: "extractPageText" },
    { frameId: 0 }
  );
}
