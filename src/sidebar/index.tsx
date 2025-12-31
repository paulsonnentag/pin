import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import browser from "webextension-polyfill";
import "./index.css";

function App() {
  const [pageText, setPageText] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const text = await getPageText();
      setPageText(text);
    } catch (err) {
      const message = String(err);
      if (message.includes("Could not establish connection")) {
        setPageText(
          "Cannot access this page. Try refreshing the tab, or this may be a browser internal page."
        );
      } else {
        setPageText(`Error: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="p-4 font-sans">
      <button
        onClick={handleClick}
        disabled={loading()}
        class="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-wait cursor-pointer"
      >
        {loading() ? "Loading..." : "Get Page Text"}
      </button>

      {pageText() && (
        <pre class="mt-4 p-3 bg-gray-100 rounded text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">
          {pageText()}
        </pre>
      )}
    </div>
  );
}

render(() => <App />, document.body);

async function getPageText(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");

  return browser.tabs.sendMessage(tab.id, { type: "extractPageText" });
}
