import browser from "webextension-polyfill";

// Message types
type MessageAction = "update" | "delete";

interface ObjectMessage {
  action: MessageAction;
  objectId: string;
  type: string;
  data?: any;
}

// Store for tracked objects, organized by tab
const trackedObjects = new Map<number, Map<string, any>>();

// Handle messages from content script
browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
  // Type guard for ObjectMessage
  const msg = message as ObjectMessage;

  const tabId = sender.tab?.id;
  if (!tabId) {
    console.warn("[Background] Received message from unknown tab");
    return;
  }

  // Ensure tab exists in store
  if (!trackedObjects.has(tabId)) {
    trackedObjects.set(tabId, new Map());
  }

  const tabObjects = trackedObjects.get(tabId)!;

  if (msg.action === "update") {
    // Create or update object
    tabObjects.set(msg.objectId, {
      type: msg.type,
      data: msg.data,
      timestamp: Date.now(),
    });
    console.log(`[Background] Tab ${tabId}: Updated ${msg.type} ${msg.objectId}`, msg.data);
  } else if (msg.action === "delete") {
    // Delete object
    if (tabObjects.has(msg.objectId)) {
      tabObjects.delete(msg.objectId);
      console.log(`[Background] Tab ${tabId}: Deleted ${msg.type} ${msg.objectId}`);
    }
  }

  // Log current state for debugging
  console.log(`[Background] Tab ${tabId} now has ${tabObjects.size} tracked objects`);
});

// Clean up when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  if (trackedObjects.has(tabId)) {
    const count = trackedObjects.get(tabId)!.size;
    trackedObjects.delete(tabId);
    console.log(`[Background] Tab ${tabId} closed, removed ${count} tracked objects`);
  }
});
