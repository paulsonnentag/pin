/**
 * Page-side Automerge library for Pin extension.
 * This module is loaded via dynamic import from injected code.
 * Connects directly to a WebSocket sync server.
 *
 * The tab document URL is provided by the background script at injection time,
 * so no runtime lookup is needed.
 *
 * Uses esm.sh CDN to load Automerge to avoid WASM loading restrictions from extension URLs.
 */

// Types for Automerge (we define these locally to avoid import issues)

import { type DocHandle, type AutomergeUrl } from "@automerge/vanillajs";

// Document types
export type TabDoc = {
  url: string;
  objects: Record<
    string,
    {
      type: string;
      data: any;
      timestamp: number;
    }
  >;
};

export type Api = {
  tabDocHandle: DocHandle<TabDoc>;
};

// Cache: tabDocUrl -> API promise
const apiCache = new Map<string, Promise<Api>>();

/**
 * Get the Pin API with document handles.
 * @param tabDocUrl - The Automerge URL for the tab document (provided by background script)
 */
export async function getApi(tabDocUrl: string): Promise<Api> {
  // Return cached promise if we already initialized for this doc
  const cached = apiCache.get(tabDocUrl);
  if (cached) {
    return cached;
  }

  const promise = initializeApi(tabDocUrl as AutomergeUrl);
  apiCache.set(tabDocUrl, promise);
  return promise;
}

async function initializeApi(tabDocUrl: AutomergeUrl): Promise<Api> {
  // Dynamically import Automerge from esm.sh
  const { Repo, initializeWasm, WebSocketClientAdapter } = await import(
    "https://esm.sh/@automerge/vanillajs/slim?bundle-deps"
  );

  // Initialize WASM from CDN
  await initializeWasm(
    fetch("https://esm.sh/@automerge/automerge/dist/automerge.wasm")
  );

  // Create repo with WebSocket sync
  const repo = new Repo({
    network: [new WebSocketClientAdapter("wss://sync.automerge.org")],
  });

  // Find the tab document using the URL provided by background
  const tabDocHandle = await repo.find(tabDocUrl);

  return {
    tabDocHandle,
  };
}
