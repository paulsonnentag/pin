import browser from "webextension-polyfill";
import {
  AutomergeUrl,
  DocHandle,
  IndexedDBStorageAdapter,
  WebSocketClientAdapter,
  Repo,
} from "@automerge/vanillajs";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new WebSocketClientAdapter("wss://sync3.automerge.org") as any],
});

// Message types
type MessageAction = "update" | "delete";

type ObjectState = {
  type: string;
  data: any;
  timestamp: number;
};

// BrowserDoc tracks all tabs and their corresponding document URLs
type BrowserDoc = {
  tabs: Record<string, { docUrl: string }>;
};

// TabDoc stores data for a single tab
type TabDoc = {
  pageUrl: string;
  objects: Record<string, ObjectState>;
};

interface ObjectMessage {
  action: MessageAction;
  objectId: string;
  type: string;
  data?: any;
}

let browserDocHandlePromise: Promise<DocHandle<BrowserDoc>> | null = null;
const tabDocHandles: Map<string, DocHandle<TabDoc>> = new Map();

export const getBrowserDocHandle = async (): Promise<DocHandle<BrowserDoc>> => {
  if (browserDocHandlePromise) {
    return browserDocHandlePromise;
  }

  browserDocHandlePromise = (async () => {
    const docUrl = localStorage.getItem("PIN_BROWSER_DOC_URL") as AutomergeUrl;
    if (docUrl) {
      const handle = await repo.find<BrowserDoc>(docUrl);
      await handle.whenReady();
      return handle;
    } else {
      const handle = repo.create<BrowserDoc>({
        tabs: {},
      });
      localStorage.setItem("PIN_BROWSER_DOC_URL", handle.url);
      return handle;
    }
  })();

  return browserDocHandlePromise;
};

export const getTabDocHandle = async (
  tabId: string,
  pageUrl?: string
): Promise<DocHandle<TabDoc>> => {
  // Check if we already have it cached
  if (tabDocHandles.has(tabId)) {
    return tabDocHandles.get(tabId)!;
  }

  const browserDocHandle = await getBrowserDocHandle();
  const browserDoc = browserDocHandle.doc();

  // Check if this tab already has a document URL
  if (browserDoc?.tabs[tabId]?.docUrl) {
    const handle = await repo.find<TabDoc>(
      browserDoc.tabs[tabId].docUrl as AutomergeUrl
    );
    await handle.whenReady();
    tabDocHandles.set(tabId, handle);
    return handle;
  }

  // Create a new TabDoc for this tab
  const handle = repo.create<TabDoc>({
    pageUrl: pageUrl || "",
    objects: {},
  });

  // Store the document URL in BrowserDoc
  browserDocHandle.change((doc: BrowserDoc) => {
    doc.tabs[tabId] = { docUrl: handle.url };
  });

  tabDocHandles.set(tabId, handle);
  return handle;
};

// Initialize and set up message handlers
getBrowserDocHandle().then((browserDocHandle) => {
  console.log("Browser document ready:", browserDocHandle.url);

  (window as any).browserDocHandle = browserDocHandle;

  // Handle messages from content script
  browser.runtime.onMessage.addListener(
    async (message: unknown, sender: browser.Runtime.MessageSender) => {
      const msg = message as ObjectMessage;

      const tabUrl = sender.tab?.url;
      if (!tabUrl) {
        console.warn("[Background] Received message from unknown tab");
        return;
      }

      const tabDocHandle = await getTabDocHandle(tabUrl, sender.tab?.url);

      if (msg.action === "update") {
        tabDocHandle.change((doc: TabDoc) => {
          doc.objects[msg.objectId] = {
            type: msg.type,
            data: msg.data,
            timestamp: Date.now(),
          };
        });
        console.log(
          `[Background] Tab ${tabUrl}: Updated ${msg.type} ${msg.objectId}`,
          msg.data
        );
      } else if (msg.action === "delete") {
        tabDocHandle.change((doc: TabDoc) => {
          if (doc.objects[msg.objectId]) {
            delete doc.objects[msg.objectId];
          }
        });
        console.log(
          `[Background] Tab ${tabUrl}: Deleted ${msg.type} ${msg.objectId}`
        );
      }

      // Log current state for debugging
      const tabDoc = tabDocHandle.doc();
      const objectCount = tabDoc ? Object.keys(tabDoc.objects).length : 0;
      console.log(
        `[Background] Tab ${tabUrl} now has ${objectCount} tracked objects`
      );
    }
  );

  // Clean up when tabs are closed
  browser.tabs.onRemoved.addListener(async (tabId) => {
    const tabIdStr = String(tabId);

    // Remove from local cache
    tabDocHandles.delete(tabIdStr);

    // Remove tab entry from BrowserDoc
    const browserDoc = browserDocHandle.doc();
    if (browserDoc?.tabs[tabIdStr]) {
      browserDocHandle.change((doc: BrowserDoc) => {
        delete doc.tabs[tabIdStr];
      });
      console.log(`[Background] Tab ${tabId} closed, removed from BrowserDoc`);
    }
  });
});
