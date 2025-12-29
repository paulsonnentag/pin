import {
  IndexedDBStorageAdapter,
  MessageChannelNetworkAdapter,
  Repo,
  AutomergeUrl,
  DocHandle,
} from "@automerge/vanillajs";
import { PageContextMessagePort } from "./messaging/PageContextMessagePort";
import { TabDoc } from "./types";

export type API = {
  getTabDocHandle: () => Promise<DocHandle<TabDoc>>;
  repo: Repo;
};

// Create a MessagePort-compatible wrapper for page context communication
const messagePort = new PageContextMessagePort();

// Create a Repo with the MessageChannelNetworkAdapter
export const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new MessageChannelNetworkAdapter(messagePort),
  ],
});

// RPC call tracking
const pendingRpcCalls = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

// Listen for RPC responses
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;

  if (msg?.type === "pin-rpc-response") {
    const pending = pendingRpcCalls.get(msg.id);
    if (pending) {
      pending.resolve(msg.result);
      pendingRpcCalls.delete(msg.id);
    }
  }
});

// Send RPC call to background
function rpcCall(method: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRpcCalls.set(id, { resolve, reject });

    window.postMessage(
      {
        type: "pin-rpc",
        method,
        id,
      },
      "*"
    );

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRpcCalls.has(id)) {
        pendingRpcCalls.delete(id);
        reject(new Error(`RPC call "${method}" timed out`));
      }
    }, 5000);
  });
}

/**
 * Get the automerge document URL for the current tab.
 */
export async function getTabDocHandle(): Promise<DocHandle<TabDoc>> {
  const docUrl = (await rpcCall("getTabUrl")) as AutomergeUrl;

  return await repo.find<TabDoc>(docUrl);
}
