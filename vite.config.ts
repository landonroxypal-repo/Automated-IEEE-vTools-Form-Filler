import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Builds the pop-up into dist/ and copies the manifest. The page script is built separately
// (vite.page.config.ts) because Chrome injects it as a classic script, which cannot use imports.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: "popup.html" },
  },
  plugins: [
    {
      name: "copy-manifest",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "manifest.json", source: readFileSync("manifest.json", "utf8") });
      },
    },
  ],
});
