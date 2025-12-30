import { AutomergeUrl, DocHandle } from "@automerge/vanillajs";
import { TabDoc } from "../types";
import { repo } from "./repo";
import { rpcCall } from "./rpc";

export type API = {
  getTabDocHandle: () => Promise<DocHandle<TabDoc>>;
  repo: typeof repo;
};

export { repo } from "./repo";
export { extractPageText } from "./dom";

/**
 * Get the automerge document URL for the current tab.
 */
export async function getTabDocHandle(): Promise<DocHandle<TabDoc>> {
  const docUrl = (await rpcCall("getTabUrl")) as AutomergeUrl;

  return await repo.find<TabDoc>(docUrl);
}
