import { contextBridge, ipcRenderer } from "electron";
import type { LabView } from "../shared/alert-state";

// The first view can arrive before React has subscribed (it renders asynchronously): keep the latest one.
let last: LabView | null = null;
let listener: ((v: LabView) => void) | null = null;
ipcRenderer.on("lab:view", (_e, v: LabView) => {
  last = v;
  listener?.(v);
});

contextBridge.exposeInMainWorld("bkhLab", {
  onView(cb: (v: LabView) => void) {
    listener = cb;
    if (last) cb(last);
  },
  close() {
    ipcRenderer.send("lab:close");
  },
});
