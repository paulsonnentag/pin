import { describe, it, expect } from "vitest";
import { outdent } from "outdent";
import { parseBlocks } from "./parser";
import type { Block, BlockEvent, DataBlock, TextBlock } from "./types";

async function* streamFromString(input: string): AsyncIterable<string> {
  for (let i = 0; i < input.length; i += 10) {
    yield input.slice(i, i + 10);
  }
}

async function collectEvents(
  stream: AsyncIterable<string>
): Promise<BlockEvent[]> {
  const events: BlockEvent[] = [];
  for await (const event of parseBlocks(stream)) {
    events.push(event);
  }
  return events;
}

function getCompletedBlocks(events: BlockEvent[]): Block[] {
  return events.filter((e) => e.type === "complete").map((e) => e.block);
}

describe("parseBlocks", () => {
  it("parses mixed text, script, and file blocks", async () => {
    const input = outdent`
      Hello, this is some introductory text.

      <script description="Update page title">
      document.title = "Hello World";
      </script>

      Here is some more text between blocks.

      <file name="my-extension.js">
      console.log("extension loaded");
      export default function() {}
      </file>

      Final text after all blocks.
    `;

    const events = await collectEvents(streamFromString(input));
    const blocks = getCompletedBlocks(events);

    expect(blocks).toHaveLength(5);

    // Text block
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as TextBlock).content).toContain("introductory text");

    // Script block
    expect(blocks[1].type).toBe("data");
    const scriptBlock = blocks[1] as DataBlock;
    expect(scriptBlock.tag).toBe("script");
    expect(scriptBlock.attributes.description).toBe("Update page title");
    expect(scriptBlock.content).toContain('document.title = "Hello World"');

    // Text between blocks
    expect(blocks[2].type).toBe("text");
    expect((blocks[2] as TextBlock).content).toContain("more text between");

    // File block
    expect(blocks[3].type).toBe("data");
    const fileBlock = blocks[3] as DataBlock;
    expect(fileBlock.tag).toBe("file");
    expect(fileBlock.attributes.name).toBe("my-extension.js");
    expect(fileBlock.content).toContain("extension loaded");

    // Final text
    expect(blocks[4].type).toBe("text");
    expect((blocks[4] as TextBlock).content).toContain("Final text");
  });

  it("handles tags with multiple attributes", async () => {
    const input = outdent`
      <custom-tag foo="bar" baz="qux" id="123">
      Content here
      </custom-tag>
    `;

    const blocks = getCompletedBlocks(
      await collectEvents(streamFromString(input))
    );

    expect(blocks).toHaveLength(1);
    const block = blocks[0] as DataBlock;
    expect(block.tag).toBe("custom-tag");
    expect(block.attributes).toEqual({ foo: "bar", baz: "qux", id: "123" });
    expect(block.content).toBe("Content here");
  });

  it("emits create, update, and complete events with consistent block id", async () => {
    const input = `<script description="test">code</script>`;
    const events = await collectEvents(streamFromString(input));
    const dataEvents = events.filter((e) => e.block.type === "data");

    const creates = dataEvents.filter((e) => e.type === "create");
    const updates = dataEvents.filter((e) => e.type === "update");
    const completes = dataEvents.filter((e) => e.type === "complete");

    expect(creates).toHaveLength(1);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(completes).toHaveLength(1);

    // All events should have the same block id
    const blockId = creates[0].block.id;
    expect(updates.every((e) => e.block.id === blockId)).toBe(true);
    expect(completes[0].block.id).toBe(blockId);
  });

  it("handles plain text with no tags", async () => {
    const input = "Just some plain text without any XML tags.";
    const blocks = getCompletedBlocks(
      await collectEvents(streamFromString(input))
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as TextBlock).content).toBe(input);
  });
});
