import {
  Repo,
  type AutomergeUrl,
  isValidAutomergeUrl,
  type DocHandle,
  IndexedDBStorageAdapter,
  WebSocketClientAdapter,
} from "@automerge/vanillajs";
import type { BrowserDoc } from "../types";

const BROWSER_DOC_URL_KEY = "browserDocUrl";

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("sidebar-repo"),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;

/**
 * Get the browser document handle from storage.
 * This must be called after the background script has created the document.
 */
export const getBrowserDocHandle =
  async (): Promise<DocHandle<BrowserDoc> | null> => {
    const stored = await browser.storage.local.get(BROWSER_DOC_URL_KEY);
    const storedUrl = stored[BROWSER_DOC_URL_KEY] as string | undefined;

    if (storedUrl && isValidAutomergeUrl(storedUrl)) {
      return repo.find<BrowserDoc>(storedUrl as AutomergeUrl);
    }

    return null;
  };
