import { getTabDocHandle } from "./api";
import type { DocHandle } from "@automerge/vanillajs";
import type { TabDoc } from "../types";

// Track if we're currently updating to avoid loops
let updatingFromDoc = false;
let updatingFromPage = false;

/**
 * Initialize bidirectional sync between page and tab document.
 */
async function init() {
  const handle = await getTabDocHandle();

  initializeDocFromPage(handle);
  watchTitleChanges(handle);
  watchUrlChanges(handle);
  watchDocChanges(handle);
}

init().catch(console.error);

/**
 * Initialize the doc with current page state if fields are empty.
 */
function initializeDocFromPage(handle: DocHandle<TabDoc>) {
  const doc = handle.doc();
  if (!doc) return;

  if (!doc.title && document.title) {
    handle.change((d: TabDoc) => {
      d.title = document.title;
    });
  }

  if (!doc.pageUrl && location.href) {
    handle.change((d: TabDoc) => {
      d.pageUrl = location.href;
    });
  }
}

/**
 * Watch for title changes in the page and sync to doc.
 */
function watchTitleChanges(handle: DocHandle<TabDoc>) {
  const observer = new MutationObserver(() => {
    if (updatingFromDoc) return;

    const currentTitle = document.title;
    const docTitle = handle.doc()?.title;

    if (currentTitle !== docTitle) {
      updatingFromPage = true;
      handle.change((d: TabDoc) => {
        d.title = currentTitle;
      });
      updatingFromPage = false;
    }
  });

  const titleElement = document.querySelector("title");
  if (titleElement) {
    observer.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

/**
 * Watch for URL changes in the page and sync to doc.
 */
function watchUrlChanges(handle: DocHandle<TabDoc>) {
  const syncUrlToDoc = () => {
    if (updatingFromDoc) return;

    const currentUrl = location.href;
    const docUrl = handle.doc()?.pageUrl;

    if (currentUrl !== docUrl) {
      updatingFromPage = true;
      handle.change((d: TabDoc) => {
        d.pageUrl = currentUrl;
      });
      updatingFromPage = false;
    }
  };

  // Listen for back/forward navigation
  window.addEventListener("popstate", syncUrlToDoc);

  // Intercept pushState and replaceState
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    syncUrlToDoc();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    syncUrlToDoc();
  };
}

/**
 * Watch for doc changes and sync to page.
 */
function watchDocChanges(handle: DocHandle<TabDoc>) {
  handle.on("change", ({ doc }) => {
    if (updatingFromPage) return;
    updatingFromDoc = true;

    // Sync title
    if (doc.title !== undefined && doc.title !== document.title) {
      document.title = doc.title;
    }

    // Sync URL (same-origin only)
    if (doc.pageUrl !== undefined && doc.pageUrl !== location.href) {
      try {
        const newUrl = new URL(doc.pageUrl);
        if (newUrl.origin === location.origin) {
          history.pushState(null, "", doc.pageUrl);
        }
      } catch {
        // Invalid URL, ignore
      }
    }

    updatingFromDoc = false;
  });
}
