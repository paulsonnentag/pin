import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        background: "src/background.ts",
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
    minify: false,
    sourcemap: false,
  },
});
