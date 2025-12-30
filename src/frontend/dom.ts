/**
 * Extracts all visible text content from the page by traversing the DOM.
 * Excludes script, style, and other non-visible elements.
 */
export function extractPageText(): string {
  const excludedTags = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "CANVAS",
    "TEMPLATE",
  ]);

  const textParts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        textParts.push(text);
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      // Skip excluded tags
      if (excludedTags.has(element.tagName)) {
        return;
      }

      // Skip hidden elements
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }

      // Recurse into children
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  }

  walk(document.body);

  return textParts.join(" ");
}

// Expose on window
(window as any).extractPageText = extractPageText;
