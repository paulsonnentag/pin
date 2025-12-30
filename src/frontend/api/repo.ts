import {
  IndexedDBStorageAdapter,
  MessageChannelNetworkAdapter,
  Repo,
} from "@automerge/vanillajs";
import { PageContextMessagePort } from "../PageContextMessagePort";

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

