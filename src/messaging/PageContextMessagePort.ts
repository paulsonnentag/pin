/**
 * MessagePort-compatible wrapper for page context (library.ts).
 * Uses window.postMessage to communicate with the content script.
 */

export class PageContextMessagePort implements MessagePort {
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();
  private started = false;
  private windowListener: ((event: MessageEvent) => void) | null = null;

  onmessage: ((this: MessagePort, ev: MessageEvent) => void) | null = null;
  onmessageerror: ((this: MessagePort, ev: MessageEvent) => void) | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.windowListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== "automerge-repo-to-page") return;

      const messageEvent = new MessageEvent("message", {
        data: event.data.payload,
      });

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
    };

    window.addEventListener("message", this.windowListener);
  }

  postMessage(
    message: unknown,
    _transfer?: Transferable[] | StructuredSerializeOptions
  ): void {
    window.postMessage(
      {
        type: "automerge-repo-to-bg",
        payload: message,
      },
      "*"
    );
  }

  close(): void {
    if (this.windowListener) {
      window.removeEventListener("message", this.windowListener);
      this.windowListener = null;
    }
    this.started = false;
    this.dispatchEvent(new Event("close"));
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
