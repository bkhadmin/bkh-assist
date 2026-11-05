import { contextBridge, ipcRenderer } from "electron";
import type { AlertCommand, AlertState } from "../shared/alert-state";

contextBridge.exposeInMainWorld("bkh", {
  onState(cb: (msg: { state: AlertState; collapsed?: boolean }) => void) {
    ipcRenderer.on("alert:state", (_e, msg) => cb(msg));
  },
  send(cmd: AlertCommand) {
    ipcRenderer.send("alert:cmd", cmd);
  },
});
