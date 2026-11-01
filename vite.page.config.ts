import { defineConfig } from "vite";

// Builds src/page/main.ts into dist/page.js as one self-contained script for executeScript({ files }).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    lib: {
      entry: "src/page/main.ts",
      formats: ["iife"],
      name: "vtoolsEventFillerPage",
      fileName: () => "page.js",
    },
  },
});
