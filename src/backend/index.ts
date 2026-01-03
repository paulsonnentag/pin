import type { WebRequest } from "webextension-polyfill";
import browser from "webextension-polyfill";

// Main background script that initializes all extension functionality
import {
  DocHandle,
  IndexedDBStorageAdapter,
  MessageChannelNetworkAdapter,
  Repo,
  WebSocketClientAdapter,
  isValidAutomergeUrl,
} from "@automerge/vanillajs";
import type { FolderDoc } from "@inkandswitch/patchwork-filesystem";
import type { BrowserDoc, SiteDoc } from "../types";
import { BackgroundMessagePort } from "./BackgroundMessagePort";
import { applyLibraryMods } from "./mods";
import { GOOGLEMAPS_MOD } from "./mods/googlemaps";
import { MAPLIBRE_MOD } from "./mods/maplibre";

const BROWSER_DOC_URL_KEY = "browserDocUrl";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;

// Helper to extract hostname from URL
const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

// Get or create a site document for a given hostname
const getOrCreateSiteDoc = async (
  browserDocHandle: DocHandle<BrowserDoc>,
  hostname: string
): Promise<DocHandle<SiteDoc>> => {
  const doc = browserDocHandle.doc();
  const existingSiteDocUrl = doc?.siteDocs?.[hostname];

  if (existingSiteDocUrl && isValidAutomergeUrl(existingSiteDocUrl)) {
    return await repo.find<SiteDoc>(existingSiteDocUrl);
  }

  // Create new site document
  const siteDocHandle = repo.create<SiteDoc>({ objects: {} });

  // Update browser doc with site document URL
  browserDocHandle.change((d: BrowserDoc) => {
    if (!d.siteDocs) d.siteDocs = {};
    d.siteDocs[hostname] = siteDocHandle.url;
  });

  return siteDocHandle;
};

// Create or load the browser document
const getOrCreateBrowserDocHandle = async (): Promise<
  DocHandle<BrowserDoc>
> => {
  const stored = await browser.storage.local.get(BROWSER_DOC_URL_KEY);
  const storedUrl = stored[BROWSER_DOC_URL_KEY];

  if (storedUrl && isValidAutomergeUrl(storedUrl)) {
    const handle = repo.find<BrowserDoc>(storedUrl);
    return handle;
  }

  // Create extension folder
  const folderHandle = repo.create<FolderDoc>({
    title: "Pin Extension",
    docs: [],
  });

  // Create new browser doc with extension folder
  const handle = repo.create<BrowserDoc>({
    tabs: {},
    siteDocs: {},
    extensionFolderUrl: folderHandle.url,
  });

  await browser.storage.local.set({ [BROWSER_DOC_URL_KEY]: handle.url });
  return handle;
};

const browserDocHandle = await getOrCreateBrowserDocHandle();
(globalThis as any).browserDocHandle = browserDocHandle;

// Track if we're updating to avoid loops
let updatingActiveTabFromDoc = false;
let updatingActiveTabFromBrowser = false;

// Initialize active tab tracking
const initActiveTabSync = async () => {
  // Get current active tab and set it in the doc
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (activeTab?.id !== undefined) {
    const currentActiveTabId = browserDocHandle.doc()?.activeTabId;
    if (currentActiveTabId !== activeTab.id) {
      updatingActiveTabFromBrowser = true;
      browserDocHandle.change((doc: BrowserDoc) => {
        doc.activeTabId = activeTab.id;
        if (activeTab.url) {
          doc.tabs[activeTab.id!] = activeTab.url;
        }
      });
      updatingActiveTabFromBrowser = false;
    }
  }

  // Listen for tab activation changes -> update doc
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    if (updatingActiveTabFromDoc) return;

    updatingActiveTabFromBrowser = true;
    browserDocHandle.change((doc: BrowserDoc) => {
      doc.activeTabId = activeInfo.tabId;
    });
    updatingActiveTabFromBrowser = false;
  });

  // Listen for doc changes -> update active tab
  browserDocHandle.on("change", async ({ doc }) => {
    if (updatingActiveTabFromBrowser) return;
    if (doc.activeTabId === undefined) return;

    // Check if the tab exists before trying to activate it
    try {
      const tab = await browser.tabs.get(doc.activeTabId);
      if (!tab) return;

      // Get current active tab
      const [currentActive] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (currentActive?.id !== doc.activeTabId) {
        updatingActiveTabFromDoc = true;
        await browser.tabs.update(doc.activeTabId, { active: true });
        updatingActiveTabFromDoc = false;
      }
    } catch {
      // Tab doesn't exist, ignore
    }
  });
};

initActiveTabSync();

// Monitor URL changes in tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const newUrl = changeInfo.url;
    const hostname = getHostname(newUrl);

    browserDocHandle.change((doc: BrowserDoc) => {
      // Update tabs record with new URL
      doc.tabs[tabId] = newUrl;
    });

    // Ensure siteDoc exists for this hostname
    if (hostname) {
      getOrCreateSiteDoc(browserDocHandle, hostname).catch(console.error);
    }
  }
});

// Clean up when tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  browserDocHandle.change((doc: BrowserDoc) => {
    delete doc.tabs[tabId];
  });
});

// Listen for tab connections and dynamically add network adapters
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
  const siteDocHandle = await getOrCreateSiteDoc(browserDocHandle, hostname);

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
    // Don't remove from tabs - that's handled by onRemoved
    // Don't remove siteDoc - other tabs may use same hostname
  });
});

// Handle RPC messages from tabs
const handleRpcMessage = async (
  port: browser.Runtime.Port,
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
    // Legacy support
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

// Toggle sidebar when browser action button is clicked
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Intercept and modify JS responses
browser.webRequest.onBeforeRequest.addListener(
  (request) => {
    // Check if the request is for a JavaScript file
    if (request.type === "script" || request.url.endsWith(".js")) {
      transformResponse(request, (source) =>
        applyLibraryMods(source, [MAPLIBRE_MOD, GOOGLEMAPS_MOD])
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

const transformResponse = (
  request: WebRequest.OnBeforeRequestDetailsType,
  transform: (response: string) => string
) => {
  const filter = browser.webRequest.filterResponseData(request.requestId);

  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let responseData = "";

  filter.ondata = (event) => {
    responseData += decoder.decode(event.data, { stream: true });
  };

  filter.onstop = () => {
    responseData += decoder.decode();

    const transformedResponse = transform(responseData);

    filter.write(encoder.encode(transformedResponse));
    filter.close();
  };
};
