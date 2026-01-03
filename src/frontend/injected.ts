import { getSiteDocHandle } from "./api";

/**
 * Initialize connection to the site document.
 * The site document is shared across all tabs with the same hostname.
 */
async function init() {
  // Get the site document handle - this establishes the connection
  const handle = await getSiteDocHandle();

  console.log("[Pin] Connected to site document:", handle.url);
}

init().catch(console.error);
