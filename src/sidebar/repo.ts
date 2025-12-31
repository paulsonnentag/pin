import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("sidebar-repo"),
});
