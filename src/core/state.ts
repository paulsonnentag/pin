import browser from "webextension-polyfill";
import { AutomergeUrl, DocHandle, IndexedDBStorageAdapter, Repo } from "@automerge/vanillajs";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [],
});

// Message types
type MessageAction = "update" | "delete";

type ObjectState = {
  type: string;
  data: any;
  timestamp: number;
};

type PinContextDoc = {
  tabs: {
    [tabId: number]: {
      objects: Record<string, ObjectState>;
    };
  };
};

interface ObjectMessage {
  action: MessageAction;
  objectId: string;
  type: string;
  data?: any;
}

let docHandlePromise: Promise<DocHandle<PinContextDoc>> | null = null;

export const getDocHandle = async (): Promise<DocHandle<PinContextDoc>> => {
  if (docHandlePromise) {
    return docHandlePromise;
  }

  docHandlePromise = (async () => {
    const docUrl = localStorage.getItem("PIN_CONTEXT_DOC_URL") as AutomergeUrl;
    if (docUrl) {
      const handle = await repo.find<PinContextDoc>(docUrl);
      await handle.whenReady();
      return handle;
    } else {
      const handle = repo.create<PinContextDoc>({
        tabs: {},
      });
      localStorage.setItem("PIN_CONTEXT_DOC_URL", handle.url);
      return handle;
    }
  })();

  return docHandlePromise;
};

// Initialize and set up message handlers
getDocHandle().then((docHandle) => {
  console.log("Automerge document ready:", docHandle.url);

  window.docHandle = docHandle;

  // Handle messages from content script
  browser.runtime.onMessage.addListener(async (message: unknown, sender: browser.Runtime.MessageSender) => {
    const msg = message as ObjectMessage;

    const tabId = sender.tab?.id;
    if (!tabId) {
      console.warn("[Background] Received message from unknown tab");
      return;
    }

    if (msg.action === "update") {
      docHandle.change((doc: PinContextDoc) => {
        // Ensure tab exists in document
        if (!doc.tabs[tabId]) {
          doc.tabs[tabId] = { objects: {} };
        }

        // Create or update object
        doc.tabs[tabId].objects[msg.objectId] = {
          type: msg.type,
          data: msg.data,
          timestamp: Date.now(),
        };
      });
      console.log(`[Background] Tab ${tabId}: Updated ${msg.type} ${msg.objectId}`, msg.data);
    } else if (msg.action === "delete") {
      docHandle.change((doc: PinContextDoc) => {
        if (doc.tabs[tabId]?.objects[msg.objectId]) {
          delete doc.tabs[tabId].objects[msg.objectId];
        }
      });
      console.log(`[Background] Tab ${tabId}: Deleted ${msg.type} ${msg.objectId}`);
    }

    // Log current state for debugging
    const doc = docHandle.doc();
    const objectCount = doc?.tabs[tabId] ? Object.keys(doc.tabs[tabId].objects).length : 0;
    console.log(`[Background] Tab ${tabId} now has ${objectCount} tracked objects`);
  });

  // Clean up when tabs are closed
  browser.tabs.onRemoved.addListener((tabId) => {
    const doc = docHandle.doc();
    if (doc?.tabs[tabId]) {
      const count = Object.keys(doc.tabs[tabId].objects).length;
      docHandle.change((doc: PinContextDoc) => {
        delete doc.tabs[tabId];
      });
      console.log(`[Background] Tab ${tabId} closed, removed ${count} tracked objects`);
    }
  });
});
