import browser from "webextension-polyfill";
import type * as API from "../frontend/api";

type APIModule = typeof API;

/**
 * Evaluate a function on the current page with access to the API module.
 * The function receives the API module as its argument and can return a value.
 * Uses browser.tabs.executeScript to directly inject and run the code.
 */
export async function evaluateOnPage<T>(
  fn: (api: APIModule) => T | Promise<T>
): Promise<T> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");

  const apiUrl = browser.runtime.getURL("api.js");
  const fnString = fn.toString();

  // Build the script that imports the API and runs the function
  const code = `
    (async () => {
      const api = await import("${apiUrl}");
      if (api.__tla) await api.__tla;
      const fn = ${fnString};
      return await fn(api);
    })();
  `;

  const results = await browser.tabs.executeScript(tab.id, {
    code,
    frameId: 0,
  });

  return results[0] as T;
}

/**
 * Run a JavaScript code string on the current page.
 * The code is wrapped in an async function, so `return` and `await` work.
 * Has access to DOM and browser APIs.
 */
export async function runCodeOnPage<T>(codeString: string): Promise<T> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");

  // Wrap the code in an async IIFE
  const code = `
    (async () => {
      ${codeString}
    })();
  `;

  const results = await browser.tabs.executeScript(tab.id, {
    code,
    frameId: 0,
  });

  return results[0] as T;
}
