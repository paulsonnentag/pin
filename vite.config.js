import { defineConfig } from "vite";
import { resolve } from "path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  base: "./",
  build: {
    target: "esnext",
    minify: false,
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "background.html"),
        content: resolve(__dirname, "src/content.ts"),
        injected: resolve(__dirname, "src/injected.ts"),
        api: resolve(__dirname, "src/api.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
      preserveEntrySignatures: "exports-only",
    },
  },
  optimizeDeps: {
    exclude: ["@automerge/automerge-wasm"],
  },
});
