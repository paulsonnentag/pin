import type { WebRequest } from "webextension-polyfill";
import browser from "webextension-polyfill";

// Main background script that initializes all extension functionality
import { applyLibraryMods } from "./mods";
import { GOOGLEMAPS_MOD } from "./mods/googlemaps";
import { MAPLIBRE_MOD } from "./mods/maplibre";
import {
  IndexedDBStorageAdapter,
  WebSocketClientAdapter,
  MessageChannelNetworkAdapter,
  Repo,
} from "@automerge/vanillajs";
import { BackgroundMessagePort } from "./messaging/BackgroundMessagePort";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    // @ts-ignore
    new WebSocketClientAdapter("wss://sync3.automerge.org"),
  ],
});

(window as any).repo = repo;

// Listen for tab connections and dynamically add network adapters
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "automerge-repo") return;

  // Wrap the browser.runtime.Port in our MessagePort-compatible wrapper
  const messagePort = new BackgroundMessagePort(port);

  // Create a MessageChannelNetworkAdapter with our wrapped port
  const adapter = new MessageChannelNetworkAdapter(
    messagePort as unknown as MessagePort
  );

  // Add the adapter to the repo's network
  // @ts-ignore - MessageChannelNetworkAdapter type mismatch
  repo.networkSubsystem.addNetworkAdapter(adapter);

  // Handle disconnection - the adapter will clean itself up via the close event
  port.onDisconnect.addListener(() => {
    // The MessageChannelNetworkAdapter handles cleanup internally
  });
});

// Intercept and modify JS responses
browser.webRequest.onBeforeRequest.addListener(
  (request) => {
    // Check if the request is for a JavaScript file
    if (request.type === "script" || request.url.endsWith(".js")) {
      transformResponse(request, (source) =>
        applyLibraryMods(source, [MAPLIBRE_MOD, GOOGLEMAPS_MOD])
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

const transformResponse = (
  request: WebRequest.OnBeforeRequestDetailsType,
  transform: (response: string) => string
) => {
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
