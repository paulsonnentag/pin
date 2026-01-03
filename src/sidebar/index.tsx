import { render } from "solid-js/web";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { Sidebar } from "./Sidebar";
import type { SidebarDoc } from "./types";
import { repo } from "./repo";
import "./index.css";

// Key for storing the document URL
const DOC_URL_KEY = "sidebar-doc-url";

async function getOrCreateHandle() {
  const stored = await browser.storage.local.get(DOC_URL_KEY);
  const url = stored[DOC_URL_KEY] as AutomergeUrl | undefined;

  if (url) {
    return repo.find<SidebarDoc>(url);
  }

  const handle = repo.create<SidebarDoc>({ messages: [] });
  await browser.storage.local.set({ [DOC_URL_KEY]: handle.url });
  return handle;
}

// Initialize and render
const handle = await getOrCreateHandle();
render(() => <Sidebar handle={handle} />, document.body);
