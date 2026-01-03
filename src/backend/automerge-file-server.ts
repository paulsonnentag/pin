import {
  Repo,
  isValidAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/vanillajs";
import {
  findHandleInFolderHandle,
  type FolderDoc,
  type UnixFileEntry,
} from "@inkandswitch/patchwork-filesystem";

/**
 * Load content from an Automerge folder and return a redirect to a data URL.
 * This is used to serve files from Automerge documents via webRequest interception.
 */
export const loadAndRedirectToDataUrl = async (
  repo: Repo,
  folderUrlStr: string,
  pathParts: string[]
): Promise<{ redirectUrl: string }> => {
  try {
    if (!isValidAutomergeUrl(folderUrlStr)) {
      throw new Error(`Invalid Automerge URL: ${folderUrlStr}`);
    }

    const folderHandle = await repo.find<FolderDoc>(folderUrlStr as AutomergeUrl);
    if (!folderHandle) {
      throw new Error(`Folder not found: ${folderUrlStr}`);
    }

    const fileHandle = await findHandleInFolderHandle<UnixFileEntry>(
      repo as any,
      folderHandle as any,
      pathParts
    );

    if (!fileHandle) {
      throw new Error(`File not found: ${pathParts.join("/")}`);
    }

    const fileDoc = fileHandle.doc() as UnixFileEntry | undefined;
    if (!fileDoc?.content) {
      throw new Error(`File has no content: ${pathParts.join("/")}`);
    }

    const content =
      typeof fileDoc.content === "string"
        ? fileDoc.content
        : fileDoc.content.toString();

    // Create a data URL with the JavaScript content
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    const dataUrl = `data:application/javascript;base64,${base64Content}`;

    console.log("[Pin] Redirecting to data URL, content size:", content.length);
    return { redirectUrl: dataUrl };
  } catch (err) {
    console.error("[Pin] Error loading for redirect:", err);
    // Return a data URL with error comment
    const errorContent = `// Error: ${err}`;
    const base64Error = btoa(errorContent);
    return { redirectUrl: `data:application/javascript;base64,${base64Error}` };
  }
};

