// electron-vite: main + preload (Node, CJS) and the React renderers (top bar, panel window).
// Output stays flat in dist/ (dist/main.js, dist/topbar-preload.js, dist/renderer/*.html) because
// topbar-window.ts, lab-window.ts and pack.mjs load those paths.
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist",
      emptyOutDir: true, // main builds first, so this clears the previous build
      sourcemap: true,
      lib: { entry: resolve(__dirname, "src/main/main.ts") },
      // native modules load at runtime; @bkh/shared ships TS source and must be bundled
      externalizeDeps: { exclude: ["@bkh/shared"] },
    },
  },
  preload: {
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: true,
      lib: {
        entry: {
          "topbar-preload": resolve(__dirname, "src/preload/topbar-preload.ts"),
          "lab-preload": resolve(__dirname, "src/preload/lab-preload.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    base: "./", // loaded with loadFile(), so asset URLs must be relative
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: {
          topbar: resolve(__dirname, "src/renderer/topbar.html"),
          lab: resolve(__dirname, "src/renderer/lab.html"),
        },
      },
    },
  },
});
