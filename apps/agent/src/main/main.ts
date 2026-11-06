/**
 * bkh_assist agent — Electron main process (background app: top bar + a tray icon to quit).
 *
 *   HOSxP "บันทึก"/F9  ->  SaveWatcher  ->  Checker (polls server)  ->  AlertWindow
 *
 * Flags:
 *   --demo             show sample alerts without HOSxP or server
 *   --step=<ms>        with --demo: how long each state stays on screen (default 4000)
 *   --shot-dir=<dir>   with --demo: save a PNG of each alert state, then quit
 */
import { app, Menu, Tray } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertState, TopbarStatus } from "../shared/alert-state";
import { AlertWindow } from "./alert-window";
import { Checker, type CheckOutcome } from "./checker";
import { loadConfig, type AgentConfig } from "./config";
import { ModuleConfig, REFRESH_MS } from "./module-config";
import { shownHn } from "./hosxp";
import { fetchHbA1c } from "./lab";
import { LabWindow } from "./lab-window";
import { PatientWatch } from "./patient-watch";
import { TopbarWindow } from "./topbar-window";
import { trayIcon } from "./tray-icon";
import { installUpdate, startUpdater } from "./updater";
import { SaveWatcher, type SaveEvent } from "./watcher";
import * as w from "./win32";

const args = process.argv.slice(1);
const HN_POLL_MS = 1000;
const DEMO = args.includes("--demo");
const SHOT_DIR = args.find((a) => a.startsWith("--shot-dir="))?.slice("--shot-dir=".length);

// the demo may run next to the real agent; only the real agent is single-instance
if (!DEMO && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("bkh_assist.agent");

let alert: AlertWindow;
let tray: Tray | null = null; // module-level: a Tray that gets garbage-collected disappears

// A packaged GUI app has no console, so log lines also go to %APPDATA%\bkh_assist agent\logs\agent.log
// One rotation at 1 MB keeps it small. Never log names/CID; HN only as yes/no.
const LOG_MAX_BYTES = 1024 * 1024;
let logFile: string | null = null;
function log(...parts: unknown[]) {
  const line = [new Date().toISOString(), ...parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : String(p)))].join(" ");
  console.log(line);
  try {
    logFile ??= (mkdirSync(app.getPath("logs"), { recursive: true }), join(app.getPath("logs"), "agent.log"));
    if (existsSync(logFile) && statSync(logFile).size > LOG_MAX_BYTES) renameSync(logFile, `${logFile}.1`);
    appendFileSync(logFile, line + "\n");
  } catch {
    // logging must never break the agent
  }
}
console.error = (...parts: unknown[]) => log("ERROR", ...parts); // watcher/checker report through console.error
process.on("uncaughtException", (err) => log("uncaughtException", err));
process.on("unhandledRejection", (err) => log("unhandledRejection", err));

function toAlert(moduleLabel: string, ev: SaveEvent, outcome: CheckOutcome): AlertState | null {
  const base = { hn: ev.hn, module: moduleLabel };
  if (outcome.kind === "error") return { kind: "error", message: outcome.message };
  if (outcome.kind !== "result") return null; // cancelled / superseded / denied by admin settings: stay quiet
  const r = outcome.response;
  const opportunities = r.opportunities.map(({ category, label }) => ({ category, label }));
  if (r.status === "ok") return { kind: "ok", ...base, opportunities };
  if (r.status === "ambiguous") return { kind: "ambiguous", ...base, count: r.candidates?.length ?? 2 };
  if (r.status === "missing")
    return {
      kind: "missing",
      ...base,
      items: r.results.filter((x) => !x.passed).map((x) => ({ label: x.label, severity: x.severity })),
      opportunities,
    };
  return null;
}

/** Made-up HN for the demo; never put a real patient number in source. */
const DEMO_HN = "0001234";

async function runDemo(cfg: AgentConfig) {
  const m = cfg.moduleLabel;
  const states: [string, AlertState, boolean?][] = [
    ["1-checking", { kind: "checking", hn: DEMO_HN, module: m }],
    ["2-ok", { kind: "ok", hn: DEMO_HN, module: m, opportunities: [] }],
    [
      "3-missing",
      {
        kind: "missing",
        hn: DEMO_HN,
        module: m,
        items: [
          { label: "ความดันโลหิต (BP)", severity: "error" },
          { label: "อาการสำคัญ (CC)", severity: "error" },
          { label: "ประวัติแพ้ยา", severity: "warning" },
        ],
        opportunities: [],
      },
    ],
    ["4-collapsed", { kind: "missing", hn: DEMO_HN, module: m, items: [{ label: "ความดันโลหิต (BP)", severity: "error" }, { label: "อาการสำคัญ (CC)", severity: "error" }], opportunities: [] }, true],
    ["5-warning-only", { kind: "missing", hn: DEMO_HN, module: m, items: [{ label: "ประวัติแพ้ยา", severity: "warning" }], opportunities: [] }],
    ["6-ambiguous", { kind: "ambiguous", hn: null, module: m, count: 3 }],
    ["7-error", { kind: "error", message: "เชื่อมต่อ server ไม่ได้" }],
    [
      "8-ok-opportunities",
      {
        kind: "ok",
        hn: DEMO_HN,
        module: m,
        opportunities: [
          { category: "PP", label: "คัดกรองมะเร็งปากมดลูก" },
          { category: "PP", label: "ตรวจคัดกรองเบาหวานและความดันโลหิตสูงในกลุ่มเสี่ยง" },
        ],
      },
    ],
    [
      "9-missing-opportunities",
      {
        kind: "missing",
        hn: DEMO_HN,
        module: m,
        items: [
          { label: "ความดันโลหิต (BP)", severity: "error" },
          { label: "ประวัติแพ้ยา", severity: "warning" },
        ],
        opportunities: [{ category: "PP", label: "คัดกรองมะเร็งปากมดลูก" }],
      },
    ],
  ];
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    const bar = new TopbarWindow({ dock: false, offscreen: true });
    const hba1c = { state: "ok" as const, results: [{ date: "2026-11-05", value: "8.4" }, { date: "2026-04-16", value: "10.1" }, { date: "2025-11-12", value: "6.4" }] };
    bar.update({ hn: DEMO_HN, labOpen: true, update: "0.2.0", hba1c });
    await new Promise((r) => setTimeout(r, 700));
    writeFileSync(join(SHOT_DIR, "0-topbar.png"), (await bar.capture()).toPNG());
    const lab = new LabWindow(() => {});
    lab.open({ hn: DEMO_HN, hba1c }, { offscreen: true });
    await new Promise((r) => setTimeout(r, 700));
    writeFileSync(join(SHOT_DIR, "0-hba1c.png"), (await lab.capture()).toPNG());
    lab.close();
    bar.destroy();
  }
  for (const [name, state, collapsed] of states) {
    await alert.show(state, { collapsed });
    const stepMs = Number(args.find((a) => a.startsWith("--step="))?.slice(7)) || 4000;
    await new Promise((r) => setTimeout(r, SHOT_DIR ? 700 : stepMs));
    if (SHOT_DIR) writeFileSync(join(SHOT_DIR, `${name}.png`), (await alert.capture()).toPNG());
  }
  app.quit();
}

app.whenReady().then(async () => {
  const { config: cfg, source } = loadConfig(app.getAppPath());
  log(`config from ${source}; server=${cfg.serverUrl} module=${cfg.module} machine=${cfg.machine}`);
  alert = new AlertWindow({ offscreen: DEMO && !!SHOT_DIR });

  if (DEMO) return runDemo(cfg);

  const checker = new Checker(cfg);
  const modules = new ModuleConfig(cfg);
  if (!cfg.agentKey) log("WARNING: agentKey is empty; the server will reject checks");

  // Sticky top bar (replaces the tray icon): shows the HN HOSxP displays right now.
  // On a new HN it also fetches that patient's last HbA1c results (once per HN).
  // The HbA1c button opens a separate, centred window with the results.
  let bar: TopbarStatus = { hn: null, labOpen: false, update: null, hba1c: { state: "loading" } };
  const setBar = (patch: Partial<TopbarStatus>) => {
    bar = { ...bar, ...patch };
    topbar.update(bar);
    if (lab.isOpen() && bar.hn) lab.update({ hn: bar.hn, hba1c: bar.hba1c });
  };
  const lab = new LabWindow(() => setBar({ labOpen: false }));
  const topbar = new TopbarWindow({
    onLab: (open) => {
      if (open && bar.hn) {
        lab.open({ hn: bar.hn, hba1c: bar.hba1c });
        setBar({ labOpen: true });
      } else lab.close();
    },
    onUpdate: () => {
      log(`installing update ${bar.update}`);
      installUpdate();
    },
  });
  startUpdater(log, (version) => {
    log(`update ${version} downloaded`);
    setBar({ update: version });
  });
  app.on("will-quit", () => topbar.destroy()); // give the reserved screen strip back to Windows

  // Tray icon: only a way to quit (right click). Everything else lives in the top bar.
  tray = new Tray(trayIcon());
  tray.setToolTip("เตือนสติ (bkh_assist)");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "ปิดเตือนสติ (bkh_assist)", click: () => app.quit() }]));
  setInterval(() => {
    let hn: string | null;
    try {
      hn = shownHn();
    } catch (err) {
      return log("topbar HN read failed", err);
    }
    if (hn === bar.hn) return;
    lab.close(); // the open results belonged to the previous patient
    setBar({ hn, hba1c: { state: "loading" } });
    if (!hn) return;
    void fetchHbA1c(cfg, hn).then((results) => {
      if (bar.hn !== hn) return; // the user already moved to another patient
      setBar({ hba1c: results ? { state: "ok", results } : { state: "error" } });
    });
  }, HN_POLL_MS);

  if (!w.isElevated()) log("WARNING: not running as Administrator; saves in an elevated HOSxP are not seen");
  if (!(await checker.health())) log("WARNING: server not reachable at start");
  await modules.refresh();
  log(`modules from ${modules.source}: ${modules.list().map((m) => m.code).join(", ") || "(none)"}`);
  setInterval(() => void modules.refresh(), REFRESH_MS);

  const watcher = new SaveWatcher();
  const patientWatch = new PatientWatch();
  watcher.on("save", async (ev) => {
    patientWatch.stop(); // the new save takes over the alert
    const mod = modules.pick(ev.form);
    log(`save trigger=${ev.trigger} form=${ev.form} hn=${ev.hn ? "yes" : "no"} module=${mod?.code ?? "(none: not checked)"}`);
    if (!mod) return; // this machine does not check this HOSxP screen
    const anchor = { x: ev.bounds.left, y: ev.bounds.top, width: ev.bounds.right - ev.bounds.left, height: ev.bounds.bottom - ev.bounds.top };
    await alert.show({ kind: "checking", hn: ev.hn, module: mod.label }, { anchor });
    const outcome = await checker.check({ module: mod.code, hn: ev.hn, savedAt: ev.savedAt });
    if (outcome.kind === "cancelled") return; // a newer save took over the alert
    if (outcome.kind === "denied") {
      // the admin changed this machine's modules since our last refresh: pick up the new list
      await modules.refresh();
    }
    const state = toAlert(mod.label, ev, outcome);
    log(`check result=${outcome.kind === "result" ? outcome.response.status : outcome.kind}`);
    if (!state) return alert.hide();
    await alert.show(state, { anchor });
    // withdraw a lingering alert once the user has moved on to another patient
    if ((state.kind === "missing" || state.kind === "ambiguous") && ev.hn) {
      patientWatch.start(ev.formHwnd, ev.hn, () => alert.isVisible(), (nowHn) => {
        log(`patient changed (${nowHn ? "other HN" : "screen closed"}); alert withdrawn`);
        alert.hide();
      });
    }
  });
  watcher.start();
  app.on("before-quit", () => watcher.stop());
});

// background app: keep running when the (hidden) alert window is the only window
app.on("window-all-closed", () => {});
