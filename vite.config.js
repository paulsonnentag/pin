import { defineConfig } from "vite";
import { resolve } from "path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), wasm(), topLevelAwait(), tailwindcss()],
  base: "./",
  test: {
    environment: "node",
  },
  build: {
    target: "esnext",
    minify: false,
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "background.html"),
        sidebar: resolve(__dirname, "sidebar.html"),
        content: resolve(__dirname, "src/frontend/content.ts"),
        injected: resolve(__dirname, "src/frontend/injected.ts"),
        api: resolve(__dirname, "src/frontend/api.ts"),
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
