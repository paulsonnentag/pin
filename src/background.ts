import type { WebRequest } from "webextension-polyfill";

// Main background script that initializes all extension functionality
import { applyLibraryMods } from "./core/mods";
import "./core/state";
import { MAPLIBRE_MOD } from "./mods/maplibre";

// Intercept and modify JS responses (Manifest V3 - filterResponseData doesn't need blocking)
browser.webRequest.onBeforeRequest.addListener(
  (request) => {
    // Check if the request is for a JavaScript file
    if (request.type === "script" || request.url.endsWith(".js")) {
      transformResponse(request, (source) => applyLibraryMods(source, [MAPLIBRE_MOD]));
    }
  },
  { urls: ["<all_urls>"] }
);

const transformResponse = (request: WebRequest.OnBeforeRequestDetailsType, transform: (response: string) => string) => {
  const filter = browser.webRequest.filterResponseData(request.requestId);

  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let responseData = "";

  filter.ondata = (event) => {
    responseData += decoder.decode(event.data, { stream: true });
  };

  filter.onstop = () => {
    responseData += decoder.decode();

    const transformedResponse = transform(responseData);
    filter.write(encoder.encode(transformedResponse));
    filter.close();
  };
};
