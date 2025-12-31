import type { Block } from "./types";

/**
 * Parses a stream of text chunks into blocks (text or code).
 * Yields complete blocks as they are detected.
 */
export async function* parseBlocks(
  stream: AsyncIterable<string>
): AsyncIterable<Block> {
  let buffer = "";
  let inCodeBlock = false;
  let codeLanguage: string | null = null;
  let codeContent = "";
  let textContent = "";

  for await (const chunk of stream) {
    buffer += chunk;

    while (true) {
      if (!inCodeBlock) {
        // Look for opening ```
        const fenceMatch = buffer.match(/^([\s\S]*?)```(\w*)\n?/);

        if (fenceMatch) {
          const textBefore = fenceMatch[1];
          const language = fenceMatch[2] || null;

          // Add text before the fence to accumulated text
          textContent += textBefore;

          // Emit text block if we have accumulated text
          if (textContent.length > 0) {
            yield { type: "text", content: textContent };
            textContent = "";
          }

          // Enter code block mode
          inCodeBlock = true;
          codeLanguage = language;
          codeContent = "";

          // Remove matched portion from buffer
          buffer = buffer.slice(fenceMatch[0].length);
        } else {
          // No fence found - check if we might have a partial fence at the end
          const partialFenceIndex = findPartialFence(buffer);

          if (partialFenceIndex !== -1) {
            // Keep potential partial fence in buffer, accumulate the rest
            textContent += buffer.slice(0, partialFenceIndex);
            buffer = buffer.slice(partialFenceIndex);
          } else {
            // No partial fence, accumulate all as text
            textContent += buffer;
            buffer = "";
          }
          break;
        }
      } else {
        // Inside code block, look for closing ```
        const closeIndex = buffer.indexOf("```");

        if (closeIndex !== -1) {
          // Found closing fence
          codeContent += buffer.slice(0, closeIndex);

          // Emit code block
          yield {
            type: "code",
            language: codeLanguage,
            content: codeContent.replace(/\n$/, ""), // trim trailing newline
          };

          // Exit code block mode
          inCodeBlock = false;
          codeLanguage = null;
          codeContent = "";

          // Remove code content and closing fence from buffer
          // Also consume optional newline after closing fence
          let remaining = buffer.slice(closeIndex + 3);
          if (remaining.startsWith("\n")) {
            remaining = remaining.slice(1);
          }
          buffer = remaining;
        } else {
          // No closing fence found - check for partial
          const partialIndex = findPartialFence(buffer);

          if (partialIndex !== -1) {
            codeContent += buffer.slice(0, partialIndex);
            buffer = buffer.slice(partialIndex);
          } else {
            codeContent += buffer;
            buffer = "";
          }
          break;
        }
      }
    }
  }

  // Stream ended - emit any remaining content
  if (inCodeBlock) {
    // Unclosed code block - emit as code anyway
    codeContent += buffer;
    if (codeContent.length > 0) {
      yield {
        type: "code",
        language: codeLanguage,
        content: codeContent.replace(/\n$/, ""),
      };
    }
  } else {
    // Emit remaining text
    textContent += buffer;
    if (textContent.length > 0) {
      yield { type: "text", content: textContent };
    }
  }
}

/**
 * Find index of a potential partial fence (`, ``, or ```) at the end of text.
 * Returns -1 if no partial fence is found.
 */
function findPartialFence(text: string): number {
  // Check for partial fence at end: `, ``, or ```
  if (text.endsWith("``")) return text.length - 2;
  if (text.endsWith("`")) return text.length - 1;
  return -1;
}
