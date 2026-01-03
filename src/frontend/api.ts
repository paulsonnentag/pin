import { AutomergeUrl, DocHandle } from "@automerge/vanillajs";
import { SiteDoc } from "../types";
import { repo } from "./repo";
import { rpcCall } from "./rpc";

export type API = {
  getSiteDocHandle: () => Promise<DocHandle<SiteDoc>>;
  repo: typeof repo;
};

export { repo } from "./repo";
export { extractPageText } from "./dom";
export { evaluateOnPage } from "../sidebar/evaluateOnPage";

/**
 * Get the automerge document handle for the current site (by hostname).
 */
export async function getSiteDocHandle(): Promise<DocHandle<SiteDoc>> {
  const docUrl = (await rpcCall("getSiteDocUrl")) as AutomergeUrl;

  return await repo.find<SiteDoc>(docUrl);
}

// Legacy alias for backwards compatibility
export const getTabDocHandle = getSiteDocHandle;
