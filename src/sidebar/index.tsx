import { render } from "solid-js/web";
import type { DocHandle, AutomergeUrl } from "@automerge/automerge-repo";
import browser from "webextension-polyfill";
import { Sidebar } from "./Sidebar";
import type { SidebarDoc } from "./types";
import "./index.css";

import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("sidebar-repo"),
});

// Key for storing the document URL
const DOC_URL_KEY = "sidebar-doc-url";

async function getOrCreateDocHandle(): Promise<DocHandle<SidebarDoc>> {
  const stored = await browser.storage.local.get(DOC_URL_KEY);
  const url = stored[DOC_URL_KEY] as AutomergeUrl | undefined;

  if (url) {
    return repo.find<SidebarDoc>(url);
  }

  const handle = repo.create<SidebarDoc>({ matches: [] });
  await browser.storage.local.set({ [DOC_URL_KEY]: handle.url });
  return handle;
}

// Initialize and render
const handle = await getOrCreateDocHandle();
render(() => <Sidebar handle={handle} />, document.body);
