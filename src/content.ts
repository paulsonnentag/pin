// Inject library.js into the page context
const script = document.createElement("script");
script.src = browser.runtime.getURL("library.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Listen for custom events from the injected code
document.addEventListener("pin:message", (event: Event) => {
  const customEvent = event as CustomEvent;
  const message = customEvent.detail;

  console.log("[Content Script] Received message:", message);

  // Forward the message to the background script
  browser.runtime.sendMessage(message).catch((error) => {
    console.error(
      "[Content Script] Failed to send message to background:",
      error
    );
  });
});

console.log("[Content Script] Listening for pin:message events");
