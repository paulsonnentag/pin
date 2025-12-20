//import browser from "webextension-polyfill";
import { IndexedDBStorageAdapter, Repo, WebSocketClientAdapter } from "@automerge/vanillajs";

// Message types
// type MessageAction = "update" | "delete";

// type ObjectState = {
//   type: string;
//   data: any;
//   timestamp: number;
// };

console.log("repo", repo);

// type Marker = { lat: number; lng: number };

// type PinContextDoc = {
//   tabs: {
//     [tabId: number]: {
//       markers: Record<string, Marker>;
//     };
//   };
// };

// export const getDocHandle = async () => {
//   let docHandle: DocHandle<PinContextDoc>;
//   const docUrl = localStorage.getItem("PIN_CONTEXT_DOC_URL") as AutomergeUrl;
//   if (docUrl) {
//     docHandle = await repo.find(docUrl);
//   } else {
//     docHandle = repo.create({
//       tabs: {},
//     });
//   }
//   return docHandle;
// };

// getDocHandle().then((docHandle) => {
//   console.log("docHandle", docHandle.url);
// });

// interface ObjectMessage {
//   action: MessageAction;
//   objectId: string;
//   type: string;
//   data?: any;
// }

// // Store for tracked objects, organized by tab
// const trackedObjects = new Map<number, Map<string, any>>();

// // Handle messages from content script
// browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
//   // Type guard for ObjectMessage
//   const msg = message as ObjectMessage;

//   const tabId = sender.tab?.id;
//   if (!tabId) {
//     console.warn("[Background] Received message from unknown tab");
//     return;
//   }

//   // Ensure tab exists in store
//   if (!trackedObjects.has(tabId)) {
//     trackedObjects.set(tabId, new Map());
//   }

//   const tabObjects = trackedObjects.get(tabId)!;

//   if (msg.action === "update") {
//     // Create or update object
//     tabObjects.set(msg.objectId, {
//       type: msg.type,
//       data: msg.data,
//       timestamp: Date.now(),
//     });
//     console.log(`[Background] Tab ${tabId}: Updated ${msg.type} ${msg.objectId}`, msg.data);
//   } else if (msg.action === "delete") {
//     // Delete object
//     if (tabObjects.has(msg.objectId)) {
//       tabObjects.delete(msg.objectId);
//       console.log(`[Background] Tab ${tabId}: Deleted ${msg.type} ${msg.objectId}`);
//     }
//   }

//   // Log current state for debugging
//   console.log(`[Background] Tab ${tabId} now has ${tabObjects.size} tracked objects`);
// });

// // Clean up when tabs are closed
// browser.tabs.onRemoved.addListener((tabId) => {
//   if (trackedObjects.has(tabId)) {
//     const count = trackedObjects.get(tabId)!.size;
//     trackedObjects.delete(tabId);
//     console.log(`[Background] Tab ${tabId} closed, removed ${count} tracked objects`);
//   }
// });
