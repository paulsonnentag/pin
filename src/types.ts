// BrowserDoc tracks all tabs and their corresponding document URLs
export type BrowserDoc = {
  tabs: Record<number, { docUrl: string }>;
};

// TabDoc stores data for a single tab
export type TabDoc = {
  title: string;
  pageUrl?: string;
};
