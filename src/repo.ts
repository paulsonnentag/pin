import {
  IndexedDBStorageAdapter,
  Repo,
  WebSocketClientAdapter,
} from "@automerge/vanillajs";

export const createRepo = () =>
  new Repo({
    storage: new IndexedDBStorageAdapter(),
    network: [
      /* @ts-ignore todo: figure out why ts is unhappy here */
      new WebSocketClientAdapter("wss://sync3.automerge.org"),
    ],
  });
