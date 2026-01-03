import type { DocHandle, Repo } from "@automerge/vanillajs";
import type {
  FolderDoc,
  UnixFileEntry,
} from "@inkandswitch/patchwork-filesystem";
import type { BrowserDoc } from "../types";

const MIME_TYPES: Record<string, string> = {
  js: "application/javascript",
  ts: "application/typescript",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  txt: "text/plain",
};

/**
 * Creates or updates a file in the extension folder.
 */
export const createOrUpdateFile = async (
  repo: Repo,
  browserDocHandle: DocHandle<BrowserDoc>,
  name: string,
  content: string
): Promise<void> => {
  const browserDoc = browserDocHandle.doc();
  if (!browserDoc?.extensionFolderUrl) {
    throw new Error("Extension folder URL not found");
  }

  const folderHandle = await repo.find<FolderDoc>(
    browserDoc.extensionFolderUrl
  );
  const folderDoc = folderHandle.doc();
  if (!folderDoc?.docs) {
    throw new Error("Folder document not found or has no docs array");
  }

  const existingEntry = folderDoc.docs.find(
    (entry: { type: string; name: string }) =>
      entry.type === "file" && entry.name === name
  );

  if (existingEntry?.url) {
    // Update existing file
    const fileHandle = await repo.find<UnixFileEntry>(existingEntry.url);
    fileHandle.change((doc: UnixFileEntry) => {
      doc.content = content;
    });
    console.log(`[Pin] Updated file: ${name}`);
  } else {
    // Create new file
    const extension = name.split(".").pop() || "";
    const fileHandle = repo.create<UnixFileEntry>({
      name,
      content,
      extension,
      mimeType: MIME_TYPES[extension] || "text/plain",
    });

    folderHandle.change((doc: FolderDoc) => {
      doc.docs.push({ name, type: "file", url: fileHandle.url });
    });
    console.log(`[Pin] Created file: ${name}`);
  }
};
