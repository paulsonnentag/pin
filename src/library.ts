import {
  IndexedDBStorageAdapter,
  MessageChannelNetworkAdapter,
  Repo,
} from "@automerge/vanillajs";
import { PageContextMessagePort } from "./messaging/PageContextMessagePort";

// Create a MessagePort-compatible wrapper for page context communication
const messagePort = new PageContextMessagePort();

// Create a Repo with the MessageChannelNetworkAdapter
// No local storage - the background script handles persistence
const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new MessageChannelNetworkAdapter(messagePort),
  ],
});

(window as any).repo = repo;
