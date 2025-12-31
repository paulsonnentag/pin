import { render } from "solid-js/web";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import browser from "webextension-polyfill";
import { Sidebar } from "./Sidebar";
import type { SidebarDoc } from "./types";
import { repo } from "./repo";
import "./index.css";

// Key for storing the document URL
const DOC_URL_KEY = "sidebar-doc-url";

async function getOrCreateDocUrl(): Promise<AutomergeUrl> {
  const stored = await browser.storage.local.get(DOC_URL_KEY);
  const url = stored[DOC_URL_KEY] as AutomergeUrl | undefined;

  if (url) {
    return url;
  }

  const handle = repo.create<SidebarDoc>({ matches: [] });
  await browser.storage.local.set({ [DOC_URL_KEY]: handle.url });
  return handle.url;
}

// Initialize and render
const docUrl = await getOrCreateDocUrl();
render(() => <Sidebar docUrl={docUrl} />, document.body);
