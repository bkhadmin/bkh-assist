// Build the Windows installer (NSIS .exe) and a portable .zip of the agent.
//   npm run dist -w @bkh/agent      ->  apps/agent/release/dist/
//   npm run release -w @bkh/agent   ->  same, then publish to GitHub Releases (needs env GH_TOKEN)
//
// The version is "version" in apps/agent/package.json; bump it before a release (a published version
// cannot be released twice). Installed agents update themselves from the GitHub Releases of the (public) code repo below.
//
// The app is staged in release/app with its own package.json that lists only the two native modules:
// everything else (our code, @bkh/shared, zod, react) is already bundled into dist/ by electron-vite. A standalone
// install avoids electron-builder guessing through the hoisted npm-workspace node_modules.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Arch, Platform, build as electronBuild } from "electron-builder";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const PUBLISH = process.argv.includes("--publish");
// Public repo that only holds the release files; the code repo (bkhadmin/bkh-assist) is private.
const RELEASES = { provider: "github", owner: "bkhadmin", repo: "bkh-assist", releaseType: "release" };

if (PUBLISH) {
  if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN is not set (a GitHub token that can write to " + RELEASES.owner + "/" + RELEASES.repo + ")");
  const res = await fetch(`https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases/tags/v${pkg.version}`, {
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json" },
  });
  if (res.ok) throw new Error(`v${pkg.version} is already released: bump "version" in apps/agent/package.json first`);
}
// read package.json files directly: koffi's "exports" does not expose "./package.json"
const rootModules = join("..", "..", "node_modules");
const versionOf = (name) => JSON.parse(readFileSync(join(rootModules, name, "package.json"), "utf8")).version;
const electronVersion = versionOf("electron");

// 1. bundle with electron-vite
execSync("npm run build", { stdio: "inherit" });

// 2. stage the app
const stage = join("release", "app");
rmSync("release", { recursive: true, force: true });
mkdirSync(join("release", "build"), { recursive: true });
mkdirSync(stage, { recursive: true });
cpSync("dist", join(stage, "dist"), { recursive: true, filter: (src) => !src.endsWith(".map") });
// tray icons: dist/main.js loads them from ../resources (electron-vite `?asset` of the resources folder)
mkdirSync(join(stage, "resources"));
for (const f of ["tray-16.png", "tray-32.png"]) cpSync(join("resources", f), join(stage, "resources", f));
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
      // electron-updater is plain JS but has its own dependencies; installing it here is simpler than bundling
      dependencies: { koffi: versionOf("koffi"), "uiohook-napi": versionOf("uiohook-napi"), "electron-updater": versionOf("electron-updater") },
    },
    null,
    2,
  ),
);
// prebuilt binaries ship in the packages (koffi via its @koromix/* optional dependency), so no install scripts
execSync("npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock", { cwd: stage, stdio: "inherit" });

// 3. app icon: the novice monk, pre-rendered from resources/novice.svg (tools/rasterize-icon.cjs)
cpSync(join("resources", "icon.png"), join("release", "build", "icon.png"));

// 4. package
await electronBuild({
  targets: Platform.WINDOWS.createTarget(["nsis", "zip"], Arch.x64),
  publish: PUBLISH ? "always" : "never",
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
      "resources/*.png",
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
    // also writes resources/app-update.yml into the app, which tells electron-updater where to look
    publish: RELEASES,
  },
});
console.log(
  PUBLISH
    ? `\nReleased v${pkg.version}: https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/tag/v${pkg.version}`
    : "\nOutput: apps/agent/release/dist/",
);
