/**
 * MessagePort-compatible wrapper for background script.
 * Wraps a browser.runtime.Port from onConnect.
 */

import type { Runtime } from "webextension-polyfill";

export class BackgroundMessagePort implements MessagePort {
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();
  private started = false;
  private port: Runtime.Port;

  onmessage: ((this: MessagePort, ev: MessageEvent) => void) | null = null;
  onmessageerror: ((this: MessagePort, ev: MessageEvent) => void) | null = null;

  constructor(port: Runtime.Port) {
    this.port = port;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.port.onMessage.addListener((msg: any) => {
      if (msg.type !== "automerge-repo-to-bg") return;

      const messageEvent = new MessageEvent("message", { data: msg.payload });

      if (this.onmessage) {
        this.onmessage.call(this, messageEvent);
      }

      const listeners = this.listeners.get("message");
      if (listeners) {
        for (const listener of listeners) {
          if (typeof listener === "function") listener(messageEvent);
          else listener.handleEvent(messageEvent);
        }
      }
    });

    this.port.onDisconnect.addListener(() => {
      this.dispatchEvent(new Event("close"));
    });
  }

  postMessage(
    message: unknown,
    _transfer?: Transferable[] | StructuredSerializeOptions
  ): void {
    this.port.postMessage({
      type: "automerge-repo-to-page",
      payload: message,
    });
  }

  close(): void {
    this.port.disconnect();
    this.started = false;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    }
    return true;
  }
}
