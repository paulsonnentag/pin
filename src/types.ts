import type { AutomergeUrl } from "@automerge/vanillajs";

// Host extension configuration
export type HostExtensionConfig = {
  host: string;
  extensions: string[]; // filenames in the folder
};

// BrowserDoc tracks all tabs and site documents
export type BrowserDoc = {
  tabs: Record<number, string>; // tabId -> current URL
  siteDocs: Record<string, AutomergeUrl>; // hostname -> automergeUrl
  extensionFolderUrl: AutomergeUrl;
  hostExtensions: HostExtensionConfig[];
  activeTabId?: number;
};

// SiteDoc stores data for a single site (by hostname)
export type SiteDoc = {
  objects: Record<string, any>;
};

// Marker position
export type Geolocation = {
  lat: number;
  lng: number;
};

// Marker data
export type WithGeopositon = {
  position: Geolocation;
};

// Re-export TabDoc as alias for backwards compatibility
export type TabDoc = SiteDoc;
