import { contextBridge, ipcRenderer } from "electron";
import type { TopbarCommand, TopbarStatus } from "../shared/alert-state";

// Messages can arrive before React has subscribed (it renders asynchronously): keep the latest of each.
let status: TopbarStatus | null = null;
let collapsed: boolean | null = null;
let onStatus: ((s: TopbarStatus) => void) | null = null;
let onCollapsed: ((v: boolean) => void) | null = null;
ipcRenderer.on("topbar:status", (_e, s: TopbarStatus) => {
  status = s;
  onStatus?.(s);
});
ipcRenderer.on("topbar:collapsed", (_e, v: boolean) => {
  collapsed = v;
  onCollapsed?.(v);
});

contextBridge.exposeInMainWorld("bkhTop", {
  onStatus(cb: (s: TopbarStatus) => void) {
    onStatus = cb;
    if (status) cb(status);
  },
  /** main confirms the collapsed state after it has moved the window */
  onCollapsed(cb: (v: boolean) => void) {
    onCollapsed = cb;
    if (collapsed != null) cb(collapsed);
  },
  send(cmd: TopbarCommand) {
    ipcRenderer.send("topbar:cmd", cmd);
  },
});
