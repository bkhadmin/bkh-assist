/**
 * bkh_assist agent — Electron main process (tray app, no main window).
 *
 *   HOSxP "บันทึก"/F9  ->  SaveWatcher  ->  Checker (polls server)  ->  AlertWindow
 *
 * Flags:
 *   --demo             show sample alerts without HOSxP or server
 *   --step=<ms>        with --demo: how long each state stays on screen (default 4000)
 *   --shot-dir=<dir>   with --demo: save a PNG of each alert state, then quit
 */
import { app, Menu, shell, Tray } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertState } from "../shared/alert-state";
import { AlertWindow } from "./alert-window";
import { Checker, type CheckOutcome } from "./checker";
import { loadConfig, type AgentConfig } from "./config";
import { ModuleConfig, REFRESH_MS } from "./module-config";
import { PatientWatch } from "./patient-watch";
import { trayIcon, type TrayTone } from "./tray-icon";
import { SaveWatcher, type SaveEvent } from "./watcher";
import * as w from "./win32";

const args = process.argv.slice(1);
const DEMO = args.includes("--demo");
const SHOT_DIR = args.find((a) => a.startsWith("--shot-dir="))?.slice("--shot-dir=".length);

// the demo may run next to the real agent; only the real agent is single-instance
if (!DEMO && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("bkh_assist.agent");

let tray: Tray | null = null;
let alert: AlertWindow;

// A packaged GUI app has no console, so log lines also go to %APPDATA%\bkh_assist agent\logs\agent.log
// (tray: "เปิดโฟลเดอร์ log"). One rotation at 1 MB keeps it small. Never log names/CID; HN only as yes/no.
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
  if (r.status === "ok") return { kind: "ok", ...base };
  if (r.status === "ambiguous") return { kind: "ambiguous", ...base, count: r.candidates?.length ?? 2 };
  if (r.status === "missing")
    return {
      kind: "missing",
      ...base,
      items: r.results.filter((x) => !x.passed).map((x) => ({ label: x.label, severity: x.severity })),
    };
  return null;
}

function buildTray(cfg: AgentConfig, modules: ModuleConfig, status: { server: boolean; elevated: boolean }, onRefresh: () => void) {
  const list = modules.list();
  const tone: TrayTone = !status.server ? "off" : !status.elevated || list.length === 0 ? "warn" : "ok";
  const tip = !status.elevated
    ? "bkh_assist — ต้องรันแบบ Administrator จึงจะเห็นการบันทึกใน HOSxP"
    : !status.server
      ? "bkh_assist — เชื่อมต่อ server ไม่ได้"
      : list.length === 0
        ? "bkh_assist — เครื่องนี้ยังไม่ได้เปิด module (ตั้งที่หน้า admin)"
        : `bkh_assist — เฝ้าตรวจ ${list.map((m) => m.label).join(", ")}`;
  const moduleItems = list.length
    ? list.map((m) => ({ label: `ตรวจ: ${m.label} (${m.code})`, enabled: false }))
    : [{ label: modules.machineActive ? "ยังไม่ได้เปิด module ให้เครื่องนี้" : "admin ปิดการใช้งานเครื่องนี้", enabled: false }];
  tray ??= new Tray(trayIcon(tone));
  tray.setImage(trayIcon(tone));
  tray.setToolTip(tip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "bkh_assist", enabled: false },
      { label: `เครื่อง: ${cfg.machine}`, enabled: false },
      ...moduleItems,
      { label: `server: ${status.server ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่ได้"} · ตั้งค่าจาก ${modules.source === "server" ? "server" : "ไฟล์ในเครื่อง"}`, enabled: false },
      ...(!status.elevated ? [{ label: "⚠ ไม่ได้รันแบบ Administrator", enabled: false }] : []),
      { type: "separator" },
      { label: "รับการตั้งค่าใหม่จาก server", click: onRefresh },
      {
        label: "ทดสอบการแจ้งเตือน",
        click: () =>
          alert.show({
            kind: "missing",
            hn: null,
            module: list[0]?.label ?? cfg.moduleLabel,
            items: [{ label: "ตัวอย่าง: ความดันโลหิต (BP)", severity: "error" }],
          }),
      },
      { label: "เปิดโฟลเดอร์ log", click: () => shell.openPath(app.getPath("logs")) },
      { type: "separator" },
      { label: "ปิด bkh_assist", click: () => app.quit() },
    ]),
  );
}

/** Made-up HN for the demo; never put a real patient number in source. */
const DEMO_HN = "0001234";

async function runDemo(cfg: AgentConfig) {
  const m = cfg.moduleLabel;
  const states: [string, AlertState, boolean?][] = [
    ["1-checking", { kind: "checking", hn: DEMO_HN, module: m }],
    ["2-ok", { kind: "ok", hn: DEMO_HN, module: m }],
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
      },
    ],
    ["4-collapsed", { kind: "missing", hn: DEMO_HN, module: m, items: [{ label: "ความดันโลหิต (BP)", severity: "error" }, { label: "อาการสำคัญ (CC)", severity: "error" }] }, true],
    ["5-warning-only", { kind: "missing", hn: DEMO_HN, module: m, items: [{ label: "ประวัติแพ้ยา", severity: "warning" }] }],
    ["6-ambiguous", { kind: "ambiguous", hn: null, module: m, count: 3 }],
    ["7-error", { kind: "error", message: "เชื่อมต่อ server ไม่ได้" }],
  ];
  if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
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
  const status = { server: await checker.health(), elevated: w.isElevated() };
  await modules.refresh();
  log(`modules from ${modules.source}: ${modules.list().map((m) => m.code).join(", ") || "(none)"}`);
  // Tray "รับการตั้งค่าใหม่จาก server": apply a module change from the admin page now instead of in ≤5 minutes.
  const refreshNow = async () => {
    const ok = await modules.refresh();
    status.server = ok || (await checker.health());
    redrawTray();
    const list = modules.list();
    const content = !ok
      ? "เชื่อมต่อ server ไม่ได้ ยังใช้การตั้งค่าเดิม"
      : list.length
        ? `ตรวจ: ${list.map((m) => m.label).join(", ")}`
        : modules.machineActive
          ? "เครื่องนี้ยังไม่ได้เปิด module (ตั้งที่หน้า admin › เครื่องที่ติดตั้ง agent)"
          : "admin ปิดการใช้งานเครื่องนี้";
    log(`manual refresh: ${ok ? "ok" : "failed"}; modules=${list.map((m) => m.code).join(", ") || "(none)"}`);
    tray?.displayBalloon({ title: "bkh_assist", content, iconType: ok ? "info" : "warning" });
  };
  const redrawTray = () => buildTray(cfg, modules, status, () => void refreshNow());
  redrawTray();
  if (!cfg.agentKey) log("WARNING: agentKey is empty; the server will reject checks");
  setInterval(async () => {
    status.server = await checker.health();
    redrawTray();
  }, 60_000);
  setInterval(async () => {
    if (await modules.refresh()) redrawTray();
  }, REFRESH_MS);

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
      if (await modules.refresh()) redrawTray();
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

// tray app: keep running when the (hidden) alert window is the only window
app.on("window-all-closed", () => {});
