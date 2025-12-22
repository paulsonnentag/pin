import browser from "webextension-polyfill";
import type { WebRequest } from "webextension-polyfill";

// Main background script that initializes all extension functionality
import { applyLibraryMods } from "./mods";
import { setExtensionLibUrl, setTabDocUrl } from "./ast-helpers";
import { getOrCreateTabDocUrl } from "./state";
import { MAPLIBRE_MOD } from "./mods/maplibre";
import { GOOGLEMAPS_MOD } from "./mods/googlemaps";

// Set the extension lib URL for dynamic imports in injected code
setExtensionLibUrl(browser.runtime.getURL("lib.js"));

// Intercept and modify JS responses
browser.webRequest.onBeforeRequest.addListener(
  (request) => {
    // Check if the request is for a JavaScript file
    if (request.type === "script" || request.url.endsWith(".js")) {
      // Get the page URL that initiated the request
      const pageUrl =
        (request as any).originUrl ||
        (request as any).documentUrl ||
        request.url;

      transformResponse(request, pageUrl, (source) =>
        applyLibraryMods(source, [MAPLIBRE_MOD, GOOGLEMAPS_MOD])
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

const transformResponse = (
  request: WebRequest.OnBeforeRequestDetailsType,
  pageUrl: string,
  transform: (response: string) => string
) => {
  const filter = browser.webRequest.filterResponseData(request.requestId);

  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let responseData = "";

  filter.ondata = (event) => {
    responseData += decoder.decode(event.data, { stream: true });
  };

  filter.onstop = async () => {
    responseData += decoder.decode();

    // Get or create the tab document URL for this page
    const tabDocUrl = await getOrCreateTabDocUrl(pageUrl);

    // Set the tab doc URL before transformation so it gets inlined
    setTabDocUrl(tabDocUrl);

    const transformedResponse = transform(responseData);

    filter.write(encoder.encode(transformedResponse));
    filter.close();
  };
};
