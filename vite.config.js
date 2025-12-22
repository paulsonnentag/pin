import { defineConfig } from "vite";
import { resolve } from "path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  base: "./",
  build: {
    target: "esnext",
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "background.html"),
        lib: resolve(__dirname, "src/page/lib.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
      // Note: inlineDynamicImports removed to allow multiple entry points
      // Each entry will be a separate bundle
      preserveEntrySignatures: "exports-only",
    },
  },
  optimizeDeps: {
    exclude: ["@automerge/automerge-wasm"],
  },
});
