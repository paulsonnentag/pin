/**
 * Shared document types for Pin extension.
 */

import type { AutomergeUrl } from "@automerge/vanillajs";

export type TabDoc = {
  url: string;
  objects: Record<
    string,
    {
      type: string;
      data: any;
      timestamp: number;
    }
  >;
};

export type BrowserDoc = {
  tabs: Record<string, { tabDocUrl: AutomergeUrl }>;
};
