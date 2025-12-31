import { useDocument } from "@automerge/automerge-repo-solid-primitives";
import type { DocHandle } from "@automerge/automerge-repo";
import browser from "webextension-polyfill";
import { repo } from "./repo";
import type { SidebarDoc } from "./types";

export function Sidebar(props: { handle: DocHandle<SidebarDoc> }) {
  const [doc] = useDocument<SidebarDoc>(() => props.handle.url, { repo });

  const handleClick = async () => {
    const text = await getPageText();

    console.log("text", text);
  };

  return (
    <div class="p-4 font-sans">
      <button
        onClick={handleClick}
        class="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
      >
        Get Page Text
      </button>
    </div>
  );
}

async function getPageText(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");

  return browser.tabs.sendMessage(
    tab.id,
    { type: "extractPageText" },
    { frameId: 0 }
  );
}
