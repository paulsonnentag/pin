import {
  IndexedDBStorageAdapter,
  Repo,
  WebSocketClientAdapter,
} from "@automerge/vanillajs";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;
