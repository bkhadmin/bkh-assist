// electron-vite: main + preload (Node, CJS) and the React alert renderer.
// Output stays flat in dist/ (dist/main.js, dist/alert-preload.js, dist/renderer/*.html) because
// alert-window.ts, topbar-window.ts and pack.mjs load those paths.
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
          "alert-preload": resolve(__dirname, "src/preload/alert-preload.ts"),
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
          alert: resolve(__dirname, "src/renderer/alert.html"),
          topbar: resolve(__dirname, "src/renderer/topbar.html"),
          lab: resolve(__dirname, "src/renderer/lab.html"),
        },
      },
    },
  },
});
