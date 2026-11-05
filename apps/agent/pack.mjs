// Build the Windows installer (NSIS .exe) and a portable .zip of the agent.
//   npm run dist -w @bkh/agent      ->  apps/agent/release/dist/
//
// The app is staged in release/app with its own package.json that lists only the two native modules:
// everything else (our code, @bkh/shared, zod) is already bundled into dist/ by esbuild. A standalone
// install avoids electron-builder guessing through the hoisted npm-workspace node_modules.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Arch, Platform, build as electronBuild } from "electron-builder";
import { drawIcon } from "./src/main/tray-png.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// read package.json files directly: koffi's "exports" does not expose "./package.json"
const rootModules = join("..", "..", "node_modules");
const versionOf = (name) => JSON.parse(readFileSync(join(rootModules, name, "package.json"), "utf8")).version;
const electronVersion = versionOf("electron");

// 1. bundle with esbuild
execSync("node build.mjs", { stdio: "inherit" });

// 2. stage the app
const stage = join("release", "app");
rmSync("release", { recursive: true, force: true });
mkdirSync(join("release", "build"), { recursive: true });
mkdirSync(stage, { recursive: true });
cpSync("dist", join(stage, "dist"), { recursive: true, filter: (src) => !src.endsWith(".map") });
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify(
    {
      name: "bkh-assist-agent",
      productName: "bkh_assist agent",
      version: pkg.version,
      description: pkg.description,
      author: "BKH",
      main: "dist/main.js",
      dependencies: { koffi: versionOf("koffi"), "uiohook-napi": versionOf("uiohook-napi") },
    },
    null,
    2,
  ),
);
// prebuilt binaries ship in the packages (koffi via its @koromix/* optional dependency), so no install scripts
execSync("npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock", { cwd: stage, stdio: "inherit" });

// 3. icon (same drawing as the tray icon)
writeFileSync(join("release", "build", "icon.png"), drawIcon(256, "ok"));

// 4. package
await electronBuild({
  targets: Platform.WINDOWS.createTarget(["nsis", "zip"], Arch.x64),
  config: {
    appId: "th.bkh.assist.agent",
    productName: "bkh_assist agent",
    executableName: "bkh-assist-agent",
    copyright: "BKH",
    electronVersion,
    electronDist: join(rootModules, "electron", "dist"),
    directories: { app: stage, output: join("release", "dist"), buildResources: join("release", "build") },
    // koffi and uiohook-napi are Node-API modules with prebuilt Windows binaries that load in Electron as-is
    // (the dev agent runs on them); rebuilding would need Python + MSVC for nothing.
    npmRebuild: false,
    nodeGypRebuild: false,
    // Chromium UI strings: only what this hospital uses (saves ~48 MB)
    electronLanguages: ["th", "en-US"],
    // electronDist is the dev Electron, which carries its demo app; the packaged agent never uses it
    afterPack: async ({ appOutDir }) => rmSync(join(appOutDir, "resources", "default_app.asar"), { force: true }),
    files: [
      "dist/**",
      "package.json",
      "node_modules/**",
      "!node_modules/uiohook-napi/{src,libuiohook,binding.gyp}",
      "!node_modules/uiohook-napi/prebuilds/{darwin,linux}-*/**",
      "!node_modules/uiohook-napi/prebuilds/win32-arm64/**",
      "!node_modules/koffi/{vendor,doc}/**", // keep src/: koffi loads src/koffi/src/static.cjs at runtime
      "!**/*.{md,ts,map}",
    ],
    // native .node files cannot be loaded from inside app.asar
    asarUnpack: ["node_modules/koffi/**", "node_modules/@koromix/**", "node_modules/uiohook-napi/**"],
    extraResources: [{ from: join("installer", "setup.ps1"), to: "setup.ps1" }],
    win: {
      icon: "icon.png",
      requestedExecutionLevel: "asInvoker", // elevation comes from the logon task, not a UAC prompt
      signAndEditExecutable: true,
      // used by the zip target; nsis has its own artifactName below
      artifactName: "bkh_assist-agent-${version}-portable.${ext}",
    },
    nsis: {
      oneClick: false,
      perMachine: true,
      allowElevation: true,
      allowToChangeInstallationDirectory: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      runAfterFinish: false, // the installer starts it itself, elevated (installer.nsh)
      include: join("installer", "installer.nsh"),
      artifactName: "bkh_assist-agent-Setup-${version}.${ext}",
      uninstallDisplayName: "bkh_assist agent",
      deleteAppDataOnUninstall: true,
    },
    publish: null,
  },
});
console.log("\nOutput: apps/agent/release/dist/");
