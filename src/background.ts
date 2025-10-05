import browser from "webextension-polyfill";

// Listen for all web requests
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if the request is for a JavaScript file
    if (details.type === "script" || details.url.endsWith(".js")) {
      console.log("JS file requested:", details.url);
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
