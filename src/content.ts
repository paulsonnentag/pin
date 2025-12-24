// Inject library.js into the page context
const script = document.createElement("script");
script.src = browser.runtime.getURL("library.js");
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
