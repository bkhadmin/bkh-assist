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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertState } from "../shared/alert-state";
import { AlertWindow } from "./alert-window";
import { Checker, type CheckOutcome } from "./checker";
import { loadConfig, type AgentConfig } from "./config";
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

function log(...parts: unknown[]) {
  console.log(new Date().toISOString(), ...parts);
}

function toAlert(cfg: AgentConfig, ev: SaveEvent, outcome: CheckOutcome): AlertState | null {
  const base = { hn: ev.hn, module: cfg.moduleLabel };
  if (outcome.kind === "error") return { kind: "error", message: outcome.message };
  if (outcome.kind !== "result") return null; // cancelled save / superseded: stay quiet
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

function buildTray(cfg: AgentConfig, status: { server: boolean; elevated: boolean }) {
  const tone: TrayTone = !status.server ? "off" : !status.elevated ? "warn" : "ok";
  const tip = !status.elevated
    ? "bkh_assist — ต้องรันแบบ Administrator จึงจะเห็นการบันทึกใน HOSxP"
    : !status.server
      ? "bkh_assist — เชื่อมต่อ server ไม่ได้"
      : `bkh_assist — เฝ้าตรวจ ${cfg.moduleLabel}`;
  tray ??= new Tray(trayIcon(tone));
  tray.setImage(trayIcon(tone));
  tray.setToolTip(tip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "bkh_assist", enabled: false },
      { label: `เครื่อง: ${cfg.machine}`, enabled: false },
      { label: `ตรวจ: ${cfg.moduleLabel} (${cfg.module})`, enabled: false },
      { label: `server: ${status.server ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่ได้"}`, enabled: false },
      ...(!status.elevated ? [{ label: "⚠ ไม่ได้รันแบบ Administrator", enabled: false }] : []),
      { type: "separator" },
      {
        label: "ทดสอบการแจ้งเตือน",
        click: () =>
          alert.show({
            kind: "missing",
            hn: null,
            module: cfg.moduleLabel,
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
  const status = { server: await checker.health(), elevated: w.isElevated() };
  buildTray(cfg, status);
  if (!cfg.agentKey) log("WARNING: agentKey is empty; the server will reject checks");
  setInterval(async () => {
    const server = await checker.health();
    if (server !== status.server) buildTray(cfg, Object.assign(status, { server }));
  }, 60_000);

  const watcher = new SaveWatcher();
  const patientWatch = new PatientWatch();
  watcher.on("save", async (ev) => {
    patientWatch.stop(); // the new save takes over the alert
    log(`save trigger=${ev.trigger} form=${ev.form} hn=${ev.hn ? "yes" : "no"}`);
    const anchor = { x: ev.bounds.left, y: ev.bounds.top, width: ev.bounds.right - ev.bounds.left, height: ev.bounds.bottom - ev.bounds.top };
    await alert.show({ kind: "checking", hn: ev.hn, module: cfg.moduleLabel }, { anchor });
    const outcome = await checker.check({ hn: ev.hn, savedAt: ev.savedAt });
    if (outcome.kind === "cancelled") return; // a newer save took over the alert
    const state = toAlert(cfg, ev, outcome);
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
