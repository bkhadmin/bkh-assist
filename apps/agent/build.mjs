// Bundles the Electron main process, preload and renderer with esbuild.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/renderer", { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "info", target: "es2023" };

await build({
  ...common,
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main.js",
  platform: "node",
  format: "cjs",
  // native modules and electron are loaded at runtime, not bundled
  external: ["electron", "koffi", "uiohook-napi"],
});

await build({
  ...common,
  entryPoints: ["src/preload/alert-preload.ts"],
  outfile: "dist/alert-preload.js",
  platform: "node",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...common,
  entryPoints: ["src/renderer/alert.ts"],
  outfile: "dist/renderer/alert.js",
  platform: "browser",
  format: "iife",
});

cpSync("src/renderer/alert.html", "dist/renderer/alert.html");
cpSync("src/renderer/alert.css", "dist/renderer/alert.css");
