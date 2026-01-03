/**
 * Tab Manager
 *
 * Handles all browser tab-related functionality:
 * - Bidirectional sync between browser active tab and the browser document
 * - Tab URL tracking and site document management
 * - Extension injection when pages load
 * - Tab lifecycle events (created, updated, removed)
 */

import type { DocHandle, Repo } from "@automerge/vanillajs";
import { isValidAutomergeUrl } from "@automerge/vanillajs";
import type { BrowserDoc, SiteDoc } from "../types";

// ============================================================================
// State
// ============================================================================

let updatingActiveTabFromDoc = false;
let updatingActiveTabFromBrowser = false;

// ============================================================================
// Helpers
// ============================================================================

export const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

// ============================================================================
// Site Document Management
// ============================================================================

export const getOrCreateSiteDoc = async (
  repo: Repo,
  browserDocHandle: DocHandle<BrowserDoc>,
  hostname: string
): Promise<DocHandle<SiteDoc>> => {
  const doc = browserDocHandle.doc();
  const existingSiteDocUrl = doc?.siteDocs?.[hostname];

  if (existingSiteDocUrl && isValidAutomergeUrl(existingSiteDocUrl)) {
    return await repo.find<SiteDoc>(existingSiteDocUrl);
  }

  const siteDocHandle = repo.create<SiteDoc>({ objects: {} });

  browserDocHandle.change((d: BrowserDoc) => {
    if (!d.siteDocs) d.siteDocs = {};
    d.siteDocs[hostname] = siteDocHandle.url;
  });

  return siteDocHandle;
};

// ============================================================================
// Extension Injection
// ============================================================================

const getExtensionsForHost = (
  browserDocHandle: DocHandle<BrowserDoc>,
  hostname: string
): string[] => {
  const browserDoc = browserDocHandle.doc();
  if (!browserDoc?.hostExtensions) return [];

  const config = browserDoc.hostExtensions.find((c) => c.host === hostname);
  return config?.extensions ?? [];
};

const injectExtensionsForTab = async (
  browserDocHandle: DocHandle<BrowserDoc>,
  tabId: number,
  hostname: string
) => {
  const extensionFilenames = getExtensionsForHost(browserDocHandle, hostname);
  if (extensionFilenames.length === 0) {
    return;
  }

  const browserDoc = browserDocHandle.doc();
  if (!browserDoc?.extensionFolderUrl) {
    console.error("[Pin] Extension folder URL not found");
    return;
  }

  console.log(
    `[Pin] Injecting ${extensionFilenames.length} extension(s) for ${hostname}`
  );

  for (const filename of extensionFilenames) {
    const scriptUrl = `/pin-automerge-files/${browserDoc.extensionFolderUrl}/${filename}`;

    const code = `
      (function() {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = ${JSON.stringify(scriptUrl)};
        script.onerror = function(e) {
          console.error('[Pin] Failed to load extension: ${filename}', e);
        };
        script.onload = function() {
          console.log('[Pin] Extension loaded: ${filename}');
        };
        document.head.appendChild(script);
      })();
    `;

    try {
      await browser.tabs.executeScript(tabId, { code, runAt: "document_idle" });
      console.log(`[Pin] Script tag injected for: ${filename}`);
    } catch (err) {
      console.error(`[Pin] Failed to inject ${filename}:`, err);
    }
  }
};

// ============================================================================
// Active Tab Sync (Bidirectional)
// ============================================================================

const initActiveTabSync = (browserDocHandle: DocHandle<BrowserDoc>) => {
  // Sync current active tab to doc on init
  browser.tabs
    .query({ active: true, currentWindow: true })
    .then(([activeTab]) => {
      if (activeTab?.id !== undefined) {
        const currentActiveTabId = browserDocHandle.doc()?.activeTabId;
        if (currentActiveTabId !== activeTab.id) {
          updatingActiveTabFromBrowser = true;
          browserDocHandle.change((doc: BrowserDoc) => {
            doc.activeTabId = activeTab.id;
            if (activeTab.url) {
              doc.tabs[activeTab.id!] = activeTab.url;
            }
          });
          updatingActiveTabFromBrowser = false;
        }
      }
    });

  // Browser -> Doc: When user changes tabs, update the doc
  browser.tabs.onActivated.addListener((activeInfo) => {
    if (updatingActiveTabFromDoc) return;

    updatingActiveTabFromBrowser = true;
    browserDocHandle.change((doc: BrowserDoc) => {
      doc.activeTabId = activeInfo.tabId;
    });
    updatingActiveTabFromBrowser = false;
  });

  // Doc -> Browser: When doc changes, switch browser tabs
  browserDocHandle.on("change", async ({ doc }) => {
    if (updatingActiveTabFromBrowser) return;
    if (doc.activeTabId === undefined) return;

    try {
      const tab = await browser.tabs.get(doc.activeTabId);
      if (!tab) return;

      const [currentActive] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (currentActive?.id !== doc.activeTabId) {
        updatingActiveTabFromDoc = true;
        await browser.tabs.update(doc.activeTabId, { active: true });
        updatingActiveTabFromDoc = false;
      }
    } catch {
      // Tab doesn't exist, ignore
    }
  });
};

// ============================================================================
// Tab Lifecycle Events
// ============================================================================

const initTabLifecycleHandlers = (
  repo: Repo,
  browserDocHandle: DocHandle<BrowserDoc>
) => {
  // Track URL changes and inject extensions when page loads
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      const hostname = getHostname(changeInfo.url);

      browserDocHandle.change((doc: BrowserDoc) => {
        doc.tabs[tabId] = changeInfo.url!;
      });

      if (hostname) {
        getOrCreateSiteDoc(repo, browserDocHandle, hostname).catch(
          console.error
        );
      }
    }

    // Inject extensions when page finishes loading
    if (changeInfo.status === "complete" && tab.url) {
      const hostname = getHostname(tab.url);
      if (hostname) {
        injectExtensionsForTab(browserDocHandle, tabId, hostname).catch(
          console.error
        );
      }
    }
  });

  // Clean up when tab is closed
  browser.tabs.onRemoved.addListener((tabId) => {
    browserDocHandle.change((doc: BrowserDoc) => {
      delete doc.tabs[tabId];
    });
  });
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize all tab management functionality.
 * Call this once during extension startup.
 */
export const initTabManager = (
  repo: Repo,
  browserDocHandle: DocHandle<BrowserDoc>
) => {
  initActiveTabSync(browserDocHandle);
  initTabLifecycleHandlers(repo, browserDocHandle);
};
