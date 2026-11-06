/**
 * Auto update from GitHub Releases of the public code repo bkhadmin/bkh-assist.
 * The new version downloads in the background; once it is ready the top bar shows an "อัปเดต" button,
 * which installs it silently and restarts the agent. Only in a packaged build (dev has no app-update.yml).
 */
import { app } from "electron";
import { autoUpdater } from "electron-updater";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export function startUpdater(log: (...parts: unknown[]) => void, onReady: (version: string) => void) {
  if (!app.isPackaged) return;
  autoUpdater.logger = { info: (m) => log("update:", m), warn: (m) => log("update warn:", m), error: (m) => log("update error:", m), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // a downloaded update also installs the next time the agent quits
  autoUpdater.on("update-downloaded", (info) => onReady(info.version));
  const check = () => autoUpdater.checkForUpdates().catch((err: Error) => log("update check failed:", err.message));
  void check();
  setInterval(check, CHECK_EVERY_MS);
}

/** Install the downloaded update silently (UAC prompt: per-machine install) and start the new version. */
export function installUpdate() {
  autoUpdater.quitAndInstall(true, true);
}
