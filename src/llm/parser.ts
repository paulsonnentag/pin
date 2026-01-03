import type { Block, BlockEvent } from "./types";

/**
 * Parses a stream of text chunks into block events.
 * Detects XML-style tags like <tagname attr="value">content</tagname>
 * and emits TextBlock for plain text, DataBlock for tagged content.
 */
export async function* parseBlocks(
  stream: AsyncIterable<string>
): AsyncIterable<BlockEvent> {
  let buffer = "";
  let inDataBlock = false;
  let currentTag = "";
  let currentAttributes: Record<string, string> = {};
  let dataContent = "";
  let textContent = "";
  let currentBlock: Block | null = null;

  function* emitEvent(type: BlockEvent["type"]): Generator<BlockEvent> {
    if (!currentBlock) return;
    yield { type, block: { ...currentBlock } };
  }

  function* startTextBlock(): Generator<BlockEvent> {
    currentBlock = { id: crypto.randomUUID(), type: "text", content: "" };
    yield* emitEvent("create");
  }

  function* startDataBlock(
    tag: string,
    attributes: Record<string, string>
  ): Generator<BlockEvent> {
    currentBlock = {
      id: crypto.randomUUID(),
      type: "data",
      tag,
      attributes,
      content: "",
    };
    yield* emitEvent("create");
  }

  function* updateBlock(newContent: string): Generator<BlockEvent> {
    if (!currentBlock) return;
    currentBlock.content = newContent;
    yield* emitEvent("update");
  }

  function* completeBlock(): Generator<BlockEvent> {
    yield* emitEvent("complete");
    currentBlock = null;
  }

  for await (const chunk of stream) {
    buffer += chunk;

    while (true) {
      if (!inDataBlock) {
        const openTagMatch = buffer.match(
          /^([\s\S]*?)<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*="[^"]*")*)>/
        );

        if (openTagMatch) {
          const textBefore = openTagMatch[1];
          const tagName = openTagMatch[2];
          const attributesStr = openTagMatch[3];

          textContent += textBefore;

          if (textContent.length > 0) {
            if (!currentBlock) yield* startTextBlock();
            yield* updateBlock(textContent);
            yield* completeBlock();
            textContent = "";
          } else if (currentBlock) {
            yield* completeBlock();
          }

          const attributes = parseAttributes(attributesStr);
          inDataBlock = true;
          currentTag = tagName;
          currentAttributes = attributes;
          dataContent = "";
          yield* startDataBlock(tagName, attributes);
          buffer = buffer.slice(openTagMatch[0].length);
        } else {
          const partialTagIndex = findPartialOpenTag(buffer);

          if (partialTagIndex !== -1) {
            const newText = buffer.slice(0, partialTagIndex);
            if (newText.length > 0) {
              if (!currentBlock) yield* startTextBlock();
              textContent += newText;
              yield* updateBlock(textContent);
            }
            buffer = buffer.slice(partialTagIndex);
          } else {
            if (buffer.length > 0) {
              if (!currentBlock) yield* startTextBlock();
              textContent += buffer;
              yield* updateBlock(textContent);
            }
            buffer = "";
          }
          break;
        }
      } else {
        const closeTag = `</${currentTag}>`;
        const closeIndex = buffer.indexOf(closeTag);

        if (closeIndex !== -1) {
          dataContent += buffer.slice(0, closeIndex);
          yield* updateBlock(dataContent.trim());
          yield* completeBlock();

          inDataBlock = false;
          currentTag = "";
          currentAttributes = {};
          dataContent = "";

          let remaining = buffer.slice(closeIndex + closeTag.length);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          buffer = remaining;
        } else {
          const partialIndex = findPartialCloseTag(buffer, currentTag);

          if (partialIndex !== -1) {
            const newData = buffer.slice(0, partialIndex);
            if (newData.length > 0) {
              dataContent += newData;
              yield* updateBlock(dataContent);
            }
            buffer = buffer.slice(partialIndex);
          } else {
            if (buffer.length > 0) {
              dataContent += buffer;
              yield* updateBlock(dataContent);
            }
            buffer = "";
          }
          break;
        }
      }
    }
  }

  // Stream ended - emit any remaining content
  if (inDataBlock) {
    dataContent += buffer;
    if (dataContent.length > 0) yield* updateBlock(dataContent.trim());
    yield* completeBlock();
  } else {
    textContent += buffer;
    if (textContent.length > 0) {
      if (!currentBlock) yield* startTextBlock();
      yield* updateBlock(textContent);
    }
    if (currentBlock) yield* completeBlock();
  }
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function findPartialOpenTag(text: string): number {
  const lastLt = text.lastIndexOf("<");
  if (lastLt === -1) return -1;
  const afterLt = text.slice(lastLt);
  if (!afterLt.includes(">") && !afterLt.startsWith("</")) return lastLt;
  return -1;
}

function findPartialCloseTag(text: string, tagName: string): number {
  const closeTag = `</${tagName}>`;
  for (let i = 1; i < closeTag.length; i++) {
    if (text.endsWith(closeTag.slice(0, i))) return text.length - i;
  }
  return -1;
}
