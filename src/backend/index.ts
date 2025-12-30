import type { WebRequest } from "webextension-polyfill";
import browser from "webextension-polyfill";

// Main background script that initializes all extension functionality
import { applyLibraryMods } from "./mods";
import { GOOGLEMAPS_MOD } from "./mods/googlemaps";
import { MAPLIBRE_MOD } from "./mods/maplibre";
import {
  IndexedDBStorageAdapter,
  WebSocketClientAdapter,
  MessageChannelNetworkAdapter,
  Repo,
  isValidAutomergeUrl,
  DocHandle,
} from "@automerge/vanillajs";
import { BackgroundMessagePort } from "./BackgroundMessagePort";
import type { BrowserDoc, TabDoc } from "../types";

const BROWSER_DOC_URL_KEY = "browserDocUrl";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;

// Create or load the browser document
const getOrCreateBrowserDocHandle = async () => {
  const stored = await browser.storage.local.get(BROWSER_DOC_URL_KEY);
  const storedUrl = stored[BROWSER_DOC_URL_KEY];

  if (storedUrl && isValidAutomergeUrl(storedUrl)) {
    const handle = repo.find<BrowserDoc>(storedUrl);
    return handle;
  }

  // Create new browser doc
  const handle = repo.create<BrowserDoc>({ tabs: {} });
  await browser.storage.local.set({ [BROWSER_DOC_URL_KEY]: handle.url });
  return handle;
};

(globalThis as any).browserDocHandle = await getOrCreateBrowserDocHandle();

// Track if we're updating to avoid loops
let updatingActiveTabFromDoc = false;
let updatingActiveTabFromBrowser = false;

// Initialize active tab tracking
const initActiveTabSync = async () => {
  const browserDocHandle = await getOrCreateBrowserDocHandle();

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

// Listen for tab connections and dynamically add network adapters
browser.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "automerge-repo") return;

  const browserDocHandle = await getOrCreateBrowserDocHandle();

  const tabId = port.sender?.tab?.id;
  const tabUrl = port.sender?.tab?.url;

  if (tabId === undefined) return;

  // Check if tab already has a document
  const existingTabDocUrl = browserDocHandle.doc()?.tabs[tabId]?.docUrl;

  let tabDocHandle: DocHandle<TabDoc>;
  if (existingTabDocUrl && isValidAutomergeUrl(existingTabDocUrl)) {
    tabDocHandle = await repo.find<TabDoc>(existingTabDocUrl);
  } else {
    // Create new tab document
    tabDocHandle = repo.create<TabDoc>({ pageUrl: tabUrl, objects: {} });

    // Update browser doc with tab's document URL
    browserDocHandle.change((doc: BrowserDoc) => {
      doc.tabs[tabId] = { docUrl: tabDocHandle.url };
    });
  }

  // Handle RPC messages from this tab
  port.onMessage.addListener((msg: any) => {
    if (msg?.type === "pin-rpc") {
      handleRpcMessage(port, msg, tabId);
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

    // repo.networkSubsystem.removeNetworkAdapter(adapter);

    // Remove from browser doc
    browserDocHandle.change((doc: BrowserDoc) => {
      delete doc.tabs[tabId];
    });
  });
});

// Handle RPC messages from tabs
const handleRpcMessage = async (
  port: browser.Runtime.Port,
  msg: { type: string; method: string; id: string },
  tabId: number
) => {
  const { method, id } = msg;
  const browserDoc = (await getOrCreateBrowserDocHandle()).doc();

  let result: unknown;

  switch (method) {
    case "getTabUrl":
      result = browserDoc?.tabs[tabId]?.docUrl;
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
