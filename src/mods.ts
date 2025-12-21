import * as acorn from "acorn";
import { generate } from "astring";

export type LibraryMod = {
  keyword: string;
  mutate: (ast: acorn.Node) => void;
};

export const applyLibraryMods = (source: string, libraryMods: LibraryMod[]) => {
  const matchingLibraryMods = libraryMods.filter((mod) => source.includes(mod.keyword));

  if (matchingLibraryMods.length === 0) {
    return source;
  }

  console.log(
    "[Interceptor] Matching library mods:",
    matchingLibraryMods.map((m) => m.keyword)
  );

  // Parse AST once
  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (error) {
    console.error("[Interceptor] Failed to parse source:", error);
    return source;
  }

  // Apply each matching mod's mutate function
  for (const mod of matchingLibraryMods) {
    mod.mutate(ast);
  }

  // Serialize the modified AST back to code
  try {
    return generate(ast);
  } catch (error) {
    console.error("[Interceptor] Failed to generate code:", error);
    return source;
  }
};
