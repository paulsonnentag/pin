import { render } from "solid-js/web";
import type { AutomergeUrl } from "@automerge/vanillajs";
import { Sidebar } from "./Sidebar";
import type { ChatDoc } from "./types";
import { repo, getBrowserDocHandle } from "./repo";
import "./index.css";

// Key for storing the document URL
const DOC_URL_KEY = "sidebar-doc-url";

async function getOrCreateHandle() {
  const stored = await browser.storage.local.get(DOC_URL_KEY);
  const url = stored[DOC_URL_KEY] as AutomergeUrl | undefined;

  if (url) {
    return repo.find<ChatDoc>(url);
  }

  const handle = repo.create<ChatDoc>({ messages: [] });
  await browser.storage.local.set({ [DOC_URL_KEY]: handle.url });
  return handle;
}

// Initialize and render
const handle = await getOrCreateHandle();
const browserDocHandle = await getBrowserDocHandle();

if (!browserDocHandle) {
  document.body.innerHTML =
    "<p>Error: Browser document not found. Please reload the extension.</p>";
} else {
  render(
    () => (
      <Sidebar
        handle={handle}
        repo={repo}
        browserDocHandle={browserDocHandle}
      />
    ),
    document.body
  );
}
