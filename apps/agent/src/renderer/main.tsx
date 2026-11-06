import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { AlertState } from "../shared/alert-state";
import { Alert } from "./Alert";
import "./alert.css";

type Msg = { state: AlertState; collapsed: boolean };
let push: (m: Msg) => void = () => {};

function App() {
  const [msg, setMsg] = useState<Msg | null>(null);
  push = setMsg;
  const setCollapsed = useCallback((collapsed: boolean) => setMsg((m) => (m ? { ...m, collapsed } : m)), []);
  return msg ? <Alert state={msg.state} collapsed={msg.collapsed} setCollapsed={setCollapsed} /> : null;
}

// flushSync everywhere: render (and measure) immediately, even while the window is hidden and before
// the main process sends the first state.
const root = createRoot(document.getElementById("app")!);
flushSync(() => root.render(<App />));
window.bkh.onState((m) => flushSync(() => push({ state: m.state, collapsed: m.collapsed ?? false })));
