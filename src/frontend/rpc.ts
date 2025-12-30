// RPC call tracking
const pendingRpcCalls = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

// Listen for RPC responses
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;

  if (msg?.type === "pin-rpc-response") {
    const pending = pendingRpcCalls.get(msg.id);
    if (pending) {
      pending.resolve(msg.result);
      pendingRpcCalls.delete(msg.id);
    }
  }
});

// Send RPC call to background
export function rpcCall(method: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRpcCalls.set(id, { resolve, reject });

    window.postMessage(
      {
        type: "pin-rpc",
        method,
        id,
      },
      "*"
    );

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRpcCalls.has(id)) {
        pendingRpcCalls.delete(id);
        reject(new Error(`RPC call "${method}" timed out`));
      }
    }, 5000);
  });
}

