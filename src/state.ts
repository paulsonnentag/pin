/**
 * Background state management for Pin extension.
 * Maintains a BrowserDoc registry that maps page URLs to tab document URLs.
 */

import {
  AutomergeUrl,
  DocHandle,
  IndexedDBStorageAdapter,
  WebSocketClientAdapter,
  Repo,
} from "@automerge/vanillajs";
import type { BrowserDoc, TabDoc } from "./types";

// Storage key for browser doc URL persistence
const BROWSER_DOC_URL_KEY = "PIN_BROWSER_DOC_URL";

// Sync server URL
const SYNC_SERVER_URL = "wss://sync.automerge.org";

// Create main repo with storage and external sync
const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new WebSocketClientAdapter(SYNC_SERVER_URL) as any],
});

// Browser document handle (initialized async)
let browserDocHandle: DocHandle<BrowserDoc> | null = null;
let browserDocReady: Promise<DocHandle<BrowserDoc>>;

/**
 * Initialize the browser document
 */
async function initBrowserDoc(): Promise<DocHandle<BrowserDoc>> {
  const existingUrl = localStorage.getItem(
    BROWSER_DOC_URL_KEY
  ) as AutomergeUrl | null;

  if (existingUrl) {
    const handle = await repo.find<BrowserDoc>(existingUrl);

    console.log("[Pin State] Loaded existing BrowserDoc:", existingUrl);
    return handle;
  }

  // Create new browser doc
  const handle = repo.create<BrowserDoc>();
  handle.change((doc) => {
    doc.tabs = {};
  });
  localStorage.setItem(BROWSER_DOC_URL_KEY, handle.url);
  console.log("[Pin State] Created new BrowserDoc:", handle.url);
  return handle;
}

// Start initialization
browserDocReady = initBrowserDoc().then((handle) => {
  browserDocHandle = handle;
  // Expose for debugging
  (globalThis as any).pinBrowserDoc = handle;
  return handle;
});

/**
 * Get or create a tab document URL for a given page URL.
 * This is called by the background script when intercepting scripts.
 */
export async function getOrCreateTabDocUrl(
  pageUrl: string
): Promise<AutomergeUrl> {
  const handle = await browserDocReady;
  const doc = handle.docSync();

  // Check if we already have a tab doc for this URL
  const existingEntry = doc?.tabs?.[pageUrl];
  if (existingEntry?.tabDocUrl) {
    console.log(
      "[Pin State] Found existing TabDoc for:",
      pageUrl,
      existingEntry.tabDocUrl
    );
    return existingEntry.tabDocUrl;
  }

  // Create new tab document
  const tabDocHandle = repo.create<TabDoc>();
  tabDocHandle.change((tabDoc) => {
    tabDoc.url = pageUrl;
    tabDoc.objects = {};
  });

  // Store in browser doc
  handle.change((browserDoc) => {
    if (!browserDoc.tabs) {
      browserDoc.tabs = {};
    }
    browserDoc.tabs[pageUrl] = { tabDocUrl: tabDocHandle.url };
  });

  console.log("[Pin State] Created new TabDoc for:", pageUrl, tabDocHandle.url);
  return tabDocHandle.url;
}

console.log("[Pin State] Background initialized");
