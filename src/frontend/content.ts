// Inject injected.js into the page context
const script = document.createElement("script");
script.src = browser.runtime.getURL("injected.js");
script.type = "module";
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Connect to background and relay messages
const port = browser.runtime.connect({ name: "automerge-repo" });

// Page → Background (automerge messages)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;

  if (msg?.type === "automerge-repo-to-bg") {
    port.postMessage(msg);
  } else if (msg?.type === "pin-rpc") {
    port.postMessage(msg);
  }
});

// Background → Page
port.onMessage.addListener((msg: any) => {
  if (msg?.type === "automerge-repo-to-page") {
    window.postMessage(msg, "*");
  } else if (msg?.type === "pin-rpc-response") {
    window.postMessage(msg, "*");
  }
});

// Handle RPC from sidebar
browser.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === "extractPageText") {
    return Promise.resolve(extractPageText());
  }
});

console.log("injected !!!");

(window as any).extractPageText = extractPageText;

function extractPageText(): string {
  const excludedTags = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "CANVAS",
    "TEMPLATE",
  ]);

  const textParts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        textParts.push(text);
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      // Skip excluded tags
      if (excludedTags.has(element.tagName)) {
        return;
      }

      // Skip hidden elements
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }

      // Recurse into children
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  }

  walk(document.body);

  return textParts.join(" ");
}
