/**
 * Background Script
 *
 * Main entry point for the extension's background context.
 * Initializes the Automerge repo, browser document, and all subsystems.
 */

import type { Runtime } from "webextension-polyfill";
import {
  DocHandle,
  IndexedDBStorageAdapter,
  MessageChannelNetworkAdapter,
  Repo,
  WebSocketClientAdapter,
  isValidAutomergeUrl,
} from "@automerge/vanillajs";
import {
  type FolderDoc,
  type UnixFileEntry,
} from "@inkandswitch/patchwork-filesystem";
import type { BrowserDoc } from "../types";
import { BackgroundMessagePort } from "./BackgroundMessagePort";
import { applyLibraryMods, transformResponse } from "./mods";
import { GOOGLEMAPS_MOD } from "./mods/googlemaps";
import { MAPLIBRE_MOD } from "./mods/maplibre";
import { loadAndRedirectToDataUrl } from "./automerge-file-server";
import { initTabManager, getOrCreateSiteDoc, getHostname } from "./tab-manager";

// ============================================================================
// Repo Initialization
// ============================================================================

const BROWSER_DOC_URL_KEY = "browserDocUrl";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;

// ============================================================================
// Browser Document Management
// ============================================================================

const getOrCreateBrowserDocHandle = async (): Promise<
  DocHandle<BrowserDoc>
> => {
  const stored = await browser.storage.local.get(BROWSER_DOC_URL_KEY);
  const storedUrl = stored[BROWSER_DOC_URL_KEY];

  if (storedUrl && isValidAutomergeUrl(storedUrl)) {
    return repo.find<BrowserDoc>(storedUrl);
  }

  // Create example extension file
  const exampleExtensionCode = `
// Example extension for example.com
console.log("[Pin] This is example.com - extension loaded!");
console.log("[Pin] Current URL:", location.href);

export default function() {
  console.log("[Pin] Extension default function called");
}
`.trim();

  const exampleFileHandle = repo.create<UnixFileEntry>({
    name: "example-extension.js",
    content: exampleExtensionCode,
    extension: "js",
    mimeType: "application/javascript",
  });

  // Create extension folder with example file
  const folderHandle = repo.create<FolderDoc>({
    title: "Pin Extension",
    docs: [
      {
        name: "example-extension.js",
        type: "file",
        url: exampleFileHandle.url,
      },
    ],
  });

  // Create new browser doc with extension folder and example config
  const handle = repo.create<BrowserDoc>({
    tabs: {},
    siteDocs: {},
    extensionFolderUrl: folderHandle.url,
    hostExtensions: [
      {
        host: "example.com",
        extensions: ["example-extension.js"],
      },
    ],
  });

  await browser.storage.local.set({ [BROWSER_DOC_URL_KEY]: handle.url });
  return handle;
};

const browserDocHandle = await getOrCreateBrowserDocHandle();
(globalThis as any).browserDocHandle = browserDocHandle;

// ============================================================================
// Debug Utilities
// ============================================================================

const resetState = async () => {
  console.log("[Pin] Resetting all state...");
  await browser.storage.local.clear();
  console.log("[Pin] Storage cleared. Reloading extension...");
  browser.runtime.reload();
};
(globalThis as any).resetState = resetState;

// ============================================================================
// Tab Management
// ============================================================================

initTabManager(repo, browserDocHandle);

// ============================================================================
// Tab Connections (Automerge Network)
// ============================================================================

browser.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "automerge-repo") return;

  const tabId = port.sender?.tab?.id;
  const tabUrl = port.sender?.tab?.url;

  if (tabId === undefined || !tabUrl) return;

  const hostname = getHostname(tabUrl);
  if (!hostname) return;

  // Update tabs record with current URL
  browserDocHandle.change((doc: BrowserDoc) => {
    doc.tabs[tabId] = tabUrl;
  });

  // Get or create site document for this hostname
  await getOrCreateSiteDoc(repo, browserDocHandle, hostname);

  // Handle RPC messages from this tab
  port.onMessage.addListener((msg: any) => {
    if (msg?.type === "pin-rpc") {
      handleRpcMessage(port, msg, tabUrl);
    }
  });

  // Wrap the browser.runtime.Port in our MessagePort-compatible wrapper
  const messagePort = new BackgroundMessagePort(port);

  // Create a MessageChannelNetworkAdapter with our wrapped port
  const adapter = new MessageChannelNetworkAdapter(messagePort);

  // Add the adapter to the repo's network
  // @ts-ignore - MessageChannelNetworkAdapter type mismatch
  repo.networkSubsystem.addNetworkAdapter(adapter);

  // Handle disconnection (tab closed or navigated away)
  port.onDisconnect.addListener(() => {
    console.log("tab disconnected", tabId);
  });
});

// ============================================================================
// RPC Handler
// ============================================================================

const handleRpcMessage = (
  port: Runtime.Port,
  msg: { type: string; method: string; id: string },
  tabUrl: string
) => {
  const { method, id } = msg;
  const browserDoc = browserDocHandle.doc();
  const hostname = getHostname(tabUrl);

  let result: unknown;

  switch (method) {
    case "getSiteDocUrl":
      result = hostname ? browserDoc?.siteDocs?.[hostname] : null;
      break;
    case "getTabUrl":
      result = hostname ? browserDoc?.siteDocs?.[hostname] : null;
      break;
    default:
      result = null;
  }

  port.postMessage({
    type: "pin-rpc-response",
    id,
    result,
  });
};

// ============================================================================
// Browser Action
// ============================================================================

browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// ============================================================================
// Request Interception
// ============================================================================

// Intercept requests and serve Automerge files or apply JS transforms
browser.webRequest.onBeforeRequest.addListener(
  (request) => {
    // Serve files from Automerge via /pin-automerge-files/<automergeUrl>/<path>
    const pinFilesMatch = request.url.match(
      /\/pin-automerge-files\/(automerge:[^/]+)\/(.+)$/
    );
    if (pinFilesMatch) {
      const [, automergeUrl, filePath] = pinFilesMatch;
      return loadAndRedirectToDataUrl(repo, automergeUrl, filePath.split("/"));
    }

    // Apply library mods to JavaScript files
    if (request.type === "script" || request.url.endsWith(".js")) {
      transformResponse(request, (source) =>
        applyLibraryMods(source, [MAPLIBRE_MOD, GOOGLEMAPS_MOD])
      );
    }
  },
  { urls: ["<all_urls>", browser.runtime.getURL("*")] },
  ["blocking"]
);

// Fix Content-Type header for virtual automerge files
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.url.includes("/pin-automerge-files/")) {
      return;
    }

    const responseHeaders =
      details.responseHeaders?.filter(
        (header) => header.name.toLowerCase() !== "content-type"
      ) || [];

    responseHeaders.push({
      name: "Content-Type",
      value: "application/javascript; charset=utf-8",
    });

    return { responseHeaders };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);
