import type { Block, BlockEvent } from "./types";

/**
 * Parses a stream of text chunks into block events.
 * Yields create/update/complete events as blocks are detected and built up.
 */
export async function* parseBlocks(
  stream: AsyncIterable<string>
): AsyncIterable<BlockEvent> {
  let buffer = "";
  let inCodeBlock = false;
  let codeLanguage: string | null = null;
  let codeContent = "";
  let textContent = "";

  // Current block being built
  let currentBlockId: string | null = null;
  let currentBlock: Block | null = null;

  // Helper to create a new block and emit create event
  function* startTextBlock(): Generator<BlockEvent> {
    currentBlockId = crypto.randomUUID();
    currentBlock = { type: "text", content: "" };
    yield {
      type: "create",
      blockId: currentBlockId,
      block: { ...currentBlock },
    };
  }

  function* startCodeBlock(language: string | null): Generator<BlockEvent> {
    currentBlockId = crypto.randomUUID();
    currentBlock = { type: "code", language, content: "" };
    yield {
      type: "create",
      blockId: currentBlockId,
      block: { ...currentBlock },
    };
  }

  // Helper to update current block content and emit update event
  function* updateBlock(newContent: string): Generator<BlockEvent> {
    if (!currentBlock || !currentBlockId) return;
    currentBlock.content = newContent;
    yield {
      type: "update",
      blockId: currentBlockId,
      block: { ...currentBlock },
    };
  }

  // Helper to complete current block and emit complete event
  function* completeBlock(): Generator<BlockEvent> {
    if (!currentBlock || !currentBlockId) return;
    yield {
      type: "complete",
      blockId: currentBlockId,
      block: { ...currentBlock },
    };
    currentBlockId = null;
    currentBlock = null;
  }

  for await (const chunk of stream) {
    buffer += chunk;

    while (true) {
      if (!inCodeBlock) {
        // Look for opening ``` followed by optional language and a newline
        // We MUST have a newline to know the language tag is complete
        const fenceMatch = buffer.match(/^([\s\S]*?)```(\w*)\n/);

        if (fenceMatch) {
          const textBefore = fenceMatch[1];
          const language = fenceMatch[2] || null;

          // Add text before the fence to accumulated text
          textContent += textBefore;

          // Complete any in-progress text block, or emit a new one if we have text
          if (textContent.length > 0) {
            if (!currentBlockId) {
              // No block in progress, create one
              yield* startTextBlock();
            }
            yield* updateBlock(textContent);
            yield* completeBlock();
            textContent = "";
          } else if (currentBlockId) {
            // Empty text but block in progress, complete it
            yield* completeBlock();
          }

          // Enter code block mode and emit create
          inCodeBlock = true;
          codeLanguage = language;
          codeContent = "";
          yield* startCodeBlock(language);

          // Remove matched portion from buffer
          buffer = buffer.slice(fenceMatch[0].length);
        } else {
          // No fence found - check if we might have a partial fence at the end
          const partialFenceIndex = findPartialFence(buffer);

          if (partialFenceIndex !== -1) {
            // Keep potential partial fence in buffer, accumulate the rest
            const newText = buffer.slice(0, partialFenceIndex);
            if (newText.length > 0) {
              // Start text block if not already started
              if (!currentBlockId) {
                yield* startTextBlock();
              }
              textContent += newText;
              yield* updateBlock(textContent);
            }
            buffer = buffer.slice(partialFenceIndex);
          } else {
            // No partial fence, accumulate all as text
            if (buffer.length > 0) {
              if (!currentBlockId) {
                yield* startTextBlock();
              }
              textContent += buffer;
              yield* updateBlock(textContent);
            }
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
          const finalContent = codeContent.replace(/\n$/, ""); // trim trailing newline

          // Update and complete code block
          yield* updateBlock(finalContent);
          yield* completeBlock();

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
            const newCode = buffer.slice(0, partialIndex);
            if (newCode.length > 0) {
              codeContent += newCode;
              yield* updateBlock(codeContent);
            }
            buffer = buffer.slice(partialIndex);
          } else {
            if (buffer.length > 0) {
              codeContent += buffer;
              yield* updateBlock(codeContent);
            }
            buffer = "";
          }
          break;
        }
      }
    }
  }

  // Stream ended - emit any remaining content
  if (inCodeBlock) {
    // Unclosed code block - complete it
    codeContent += buffer;
    if (codeContent.length > 0) {
      yield* updateBlock(codeContent.replace(/\n$/, ""));
    }
    yield* completeBlock();
  } else {
    // Complete remaining text
    textContent += buffer;
    if (textContent.length > 0) {
      if (!currentBlockId) {
        yield* startTextBlock();
        yield* updateBlock(textContent);
      }
    }
    if (currentBlockId) {
      yield* completeBlock();
    }
  }
}

/**
 * Find index of a potential partial fence at the end of text.
 * This includes:
 * - Partial backticks: `, ``
 * - Complete fence without newline: ```js (waiting for \n)
 * Returns -1 if no partial fence is found.
 */
function findPartialFence(text: string): number {
  // Check for ``` followed by word chars but no newline yet (incomplete language tag)
  const fenceWithoutNewline = text.match(/```\w*$/);
  if (fenceWithoutNewline) {
    return fenceWithoutNewline.index!;
  }
  // Check for partial fence at end: `, ``
  if (text.endsWith("``")) return text.length - 2;
  if (text.endsWith("`")) return text.length - 1;
  return -1;
}
