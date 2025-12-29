// BrowserDoc tracks all tabs and their corresponding document URLs
export type BrowserDoc = {
  tabs: Record<number, { docUrl: string }>;
  activeTabId?: number;
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

// TabDoc stores data for a single tab
export type TabDoc = {
  title?: string;
  pageUrl?: string;
  objects: Record<string, any>;
};
