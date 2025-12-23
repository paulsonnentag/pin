// BrowserDoc tracks all tabs and their corresponding document URLs
type BrowserDoc = {
  tabs: Record<number, { docUrl: string }>;
};

// TabDoc stores data for a single tab
type TabDoc = {
  pageUrl?: string;
};
