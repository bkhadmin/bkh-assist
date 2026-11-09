/**
 * bkh_assist agent — Electron main process (background app: top bar + a tray icon to quit).
 *
 *   HOSxP "บันทึก"/F9  ->  SaveWatcher  ->  Checker (polls server)  ->  top bar "บันทึก" badge (+ large panel)
 *
 * Flags:
 *   --demo --shot-dir=<dir>   save PNGs of the top bar and its panels with sample data (no HOSxP or server), then quit
 */
import { app, Menu, Tray } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertState, Panel, SaveCheck, ServicePoint, TopbarStatus } from "../shared/alert-state";
import { Checker, type CheckOutcome } from "./checker";
import { loadConfig, type AgentConfig } from "./config";
import { ModuleConfig, REFRESH_MS } from "./module-config";
import { savesHidden, shownHn } from "./hosxp";
import { fetchAuthen, fetchOpportunities, fetchRlu, servicePoint } from "./lab";
import { LabWindow } from "./lab-window";
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
  const save: SaveCheck = {
    kind: "missing",
    hn: DEMO_HN,
    module: cfg.moduleLabel,
    at: "09:41",
    name: "นายทดสอบ ระบบเตือนสติ",
    items: [
      { label: "ความดันโลหิต (BP)", severity: "error" },
      { label: "อาการสำคัญ (CC)", severity: "error" },
      { label: "ประวัติแพ้ยา", severity: "warning" },
    ],
    opportunities: [],
  };
  if (!SHOT_DIR) return app.quit();
  {
    mkdirSync(SHOT_DIR, { recursive: true });
    const bar = new TopbarWindow({ dock: false, offscreen: true });
    const rlu = {
      state: "ok" as const,
      items: [
        { code: "HBA1C", label: "HbA1c", warn: true, message: "ผู้ป่วยเบาหวาน ไม่ได้ตรวจ HbA1c เกิน 90 วัน", results: [{ date: "2026-04-16", value: "8.4", name: "HbA1c" }, { date: "2025-11-12", value: "10.1", name: "HbA1c" }, { date: "2025-05-20", value: "6.4", name: "HbA1c" }] },
        { code: "LDL", label: "LDL", warn: false, message: null, results: [{ date: "2026-09-02", value: "96", name: "LDL-C (direct)" }] },
        { code: "CREATININE", label: "Creatinine", warn: false, message: null, results: [{ date: "2026-10-01", value: "1.02", name: "Creatinine" }, { date: "2026-03-11", value: "0.98", name: "Creatinine" }, { date: "2025-09-30", value: "1.10", name: "Creatinine (enzymatic)" }] },
        { code: "UACR", label: "Urine albumin/creatinine", warn: false, message: null, results: [] },
      ],
    };
    const demoSettings = {
      state: "ok" as const,
      saving: false,
      saved: false,
      selected: ["OPDVisitcheck"],
      modules: [
        { code: "OPDVisitcheck", label: "ซักประวัติ OPD", description: "ตรวจการบันทึกหน้าซักประวัติ OPD: สัญญาณชีพ น้ำหนัก ส่วนสูง และอาการสำคัญ" },
        { code: "Doctorcheck", label: "ห้องตรวจแพทย์", description: "ตรวจการบันทึกของแพทย์: แพทย์ผู้ตรวจ การวินิจฉัยหลัก และการตรวจร่างกาย" },
      ],
    };
    const noAuthen = { state: "ok" as const, name: "นายทดสอบ ระบบเตือนสติ", visitDate: "2026-11-06", visitAt: "2026-11-06 08:15", authCode: null, hipdata: "UCS", close: null };
    const opps = { state: "ok" as const, items: [{ code: "PP.COLORECTAL", category: "PP", label: "คัดกรองมะเร็งลำไส้ใหญ่ (FIT)", price: 60, detail: { basis: "อายุ 62 ปี", lastDone: "2024-03-12", due: "ก่อนอายุครบ 71 ปี" } }, { code: "PP.ELDER_FLU", category: "PP", label: "วัคซีนไข้หวัดใหญ่ประจำปี", detail: { basis: "อายุ 62 ปี", lastDone: null, due: "2027-09-30" } }, { code: "OFC.TTM", category: "OFC", label: "แพทย์แผนไทย (นวด ประคบ ยาสมุนไพร)", price: 250 }, { code: "OFC.DENTAL", category: "OFC", label: "ทันตกรรม (ตรวจฟัน ขูดหินปูน อุดฟัน)", price: 1200 }] };
    bar.update({ hn: DEMO_HN, panel: null, update: "0.2.0", blind: false, save, authen: noAuthen, rlu, opps });
    await new Promise((r) => setTimeout(r, 900));
    writeFileSync(join(SHOT_DIR, "0-topbar.png"), (await bar.capture()).toPNG());
    const lab = new LabWindow(() => {});
    lab.open({ hn: DEMO_HN, panel: "rlu", save, settings: demoSettings, rlu, opps, authen: noAuthen, demoExpand: "CREATININE" }, { offscreen: true, anchor: bar.below(260) });
    await new Promise((r) => setTimeout(r, 700));
    writeFileSync(join(SHOT_DIR, "0-rlu.png"), (await lab.capture()).toPNG());
    lab.open({ hn: DEMO_HN, panel: "opps", save, settings: demoSettings, rlu, opps, authen: noAuthen }, { offscreen: true });
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(SHOT_DIR, "0-opps.png"), (await lab.capture()).toPNG());
    lab.update({ hn: DEMO_HN, panel: "authen", save, settings: demoSettings, rlu, opps, authen: noAuthen });
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(SHOT_DIR, "0-authen.png"), (await lab.capture()).toPNG());
    lab.update({ hn: DEMO_HN, panel: "settings", save, settings: demoSettings, version: app.getVersion(), rlu, opps, authen: noAuthen });
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(SHOT_DIR, "0-settings.png"), (await lab.capture()).toPNG());
    lab.update({ hn: DEMO_HN, panel: "ofc", save, settings: demoSettings, rlu, opps, authen: noAuthen });
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(SHOT_DIR, "0-ofc.png"), (await lab.capture()).toPNG());
    lab.update({ hn: DEMO_HN, panel: "save", save, settings: demoSettings, rlu, opps, authen: noAuthen });
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(SHOT_DIR, "0-save.png"), (await lab.capture()).toPNG());
    lab.close();
    bar.destroy();
  }
  app.quit();
}

app.whenReady().then(async () => {
  const { config: cfg, source } = loadConfig(app.getAppPath());
  log(`config from ${source}; server=${cfg.serverUrl} module=${cfg.module} machine=${cfg.machine}`);
  if (DEMO) return runDemo(cfg);

  const checker = new Checker(cfg);
  const modules = new ModuleConfig(cfg);
  if (!cfg.agentKey) log("WARNING: agentKey is empty; the server will reject checks");

  // Sticky top bar (replaces the tray icon): shows the HN HOSxP displays right now.
  // On a new HN it also fetches that patient's RLU items and "จัดเก็บ" opportunities (once per HN, again after a save of that patient).
  // Their buttons open a separate window: centred, or for RLU a dropdown under its badge.
  let bar: TopbarStatus = { hn: null, panel: null, update: null, blind: false, save: null, authen: { state: "loading" }, rlu: { state: "loading" }, opps: { state: "loading" } };
  let settings: ServicePoint = { state: "loading" };
  const view = () => ({ hn: bar.hn, panel: bar.panel!, save: bar.save, settings, version: app.getVersion(), rlu: bar.rlu, opps: bar.opps, authen: bar.authen });
  const showSettings = (next: ServicePoint) => {
    settings = next;
    if (lab.isOpen() && bar.panel === "settings") lab.update(view());
  };
  // Refetched on HN change and whenever จัดเก็บ/OFC opens: admin edits or a service-point change apply to the open patient.
  const refreshOpps = async () => {
    const hn = bar.hn;
    if (!hn) return;
    const items = await fetchOpportunities(cfg, hn);
    if (bar.hn === hn) setBar({ opps: items ? { state: "ok", items } : { state: "error" } });
  };
  // The on-screen patient's badges (Authen/close, RLU, opportunities); one fetch at a time per HN.
  const loading = new Set<string>();
  const loadPatient = (hn: string) => {
    if (loading.has(hn)) return;
    loading.add(hn);
    void Promise.all([
      fetchAuthen(cfg, hn).then((a) => bar.hn === hn && setBar({ authen: a ? { state: "ok", ...a } : { state: "error" } })),
      fetchRlu(cfg, hn).then((items) => bar.hn === hn && setBar({ rlu: items ? { state: "ok", items } : { state: "error" } })),
      refreshOpps(),
    ]).finally(() => loading.delete(hn));
  };
  const loadSettings = async (module?: string) => {
    const r = await servicePoint(cfg, module);
    if (!r) return showSettings({ state: "error", message: "เชื่อมต่อ server ไม่ได้" });
    if (!r.active) return showSettings({ state: "error", message: "admin ปิดการใช้งานเครื่องนี้" });
    showSettings({ state: "ok", modules: r.modules, selected: r.selected, saving: false, saved: Boolean(module) });
    if (module) {
      log(`service point set to ${module}`);
      await modules.refresh(); // the next save is checked with the new module right away
      void refreshOpps();
    }
  };
  const ownPanel = (p: Panel) => p === "settings" || p === "save";
  const setBar = (patch: Partial<TopbarStatus>) => {
    bar = { ...bar, ...patch };
    topbar.update(bar);
    if (lab.isOpen() && bar.panel && (bar.hn || ownPanel(bar.panel))) lab.update(view());
  };
  const lab = new LabWindow(
    () => setBar({ panel: null }),
    (code) => {
      if (settings.state === "ok") showSettings({ ...settings, saving: true, saved: false });
      void loadSettings(code);
    },
    () => {
      setBar({ save: null }); // "รับทราบ"
      lab.close();
    },
  );
  const topbar = new TopbarWindow({
    onPanel: (panel, x) => {
      if (panel === "settings") {
        settings = { state: "loading" };
        void loadSettings();
      }
      if (panel === "opps" || panel === "ofc") void refreshOpps();
      if (panel && (bar.hn || ownPanel(panel))) {
        setBar({ panel });
        lab.open(view(), panel === "rlu" ? { anchor: topbar.below(x ?? 0) } : {});
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
    let hn: string | null | undefined;
    try {
      hn = shownHn();
    } catch (err) {
      return log("topbar HN read failed", err);
    }
    if (hn === undefined || hn === bar.hn) return; // undefined: HOSxP busy, keep the last HN
    if (!bar.panel || !ownPanel(bar.panel)) lab.close(); // the open results belonged to the previous patient
    setBar({ hn, authen: { state: "loading" }, rlu: { state: "loading" }, opps: { state: "loading" } });
    loading.clear(); // a fetch started before the user left and came back may have dropped some results: fetch again
    if (hn) loadPatient(hn);
  }, HN_POLL_MS);

  if (!w.isElevated()) log("WARNING: not running as Administrator; saves in an elevated HOSxP are not seen");
  // Say so on the top bar instead of failing silently (checked every few seconds: HOSxP may be restarted elevated).
  const checkBlind = () => {
    try {
      const blind = savesHidden();
      if (blind !== bar.blind) {
        log(blind ? "WARNING: HOSxP runs as Administrator, this agent does not: saves are not seen" : "saves visible again");
        setBar({ blind });
      }
    } catch (err) {
      log("elevation check failed", err);
    }
  };
  checkBlind();
  setInterval(checkBlind, 10_000);
  if (!(await checker.health())) log("WARNING: server not reachable at start");
  await modules.refresh();
  log(`modules from ${modules.source}: ${modules.list().map((m) => m.code).join(", ") || "(none)"}`);
  setInterval(() => void modules.refresh(), REFRESH_MS);

  const watcher = new SaveWatcher();
  // Save results show only on the top bar: the "บันทึก" badge (click = large panel). A result stays while its patient
  // is on screen; the HN poll above clears it when the user moves to another patient.
  // The save result belongs to the SAVED patient: HOSxP clears the screen right after F9, before the check returns.
  // It stays on the bar until the next save replaces it or the user presses "รับทราบ"; "ok" clears itself.
  const OK_CLEAR_MS = 15_000;
  let saveName: { hn: string; name: string | null } | null = null;
  const showSave = (ev: SaveEvent, state: AlertState | null) => {
    const at = ev.savedAt.toTimeString().slice(0, 5);
    const name = saveName && saveName.hn === ev.hn ? saveName.name : null;
    setBar({ save: state && { ...state, at, name } });
    if (state?.kind === "ok") {
      setTimeout(() => bar.save?.kind === "ok" && bar.save.at === at && bar.save.hn === ev.hn && setBar({ save: null }), OK_CLEAR_MS);
    }
  };
  watcher.on("save", async (ev) => {
    const mod = modules.pick(ev.form);
    log(`save trigger=${ev.trigger} form=${ev.form} hn=${ev.hn ? "yes" : "no"} module=${mod?.code ?? "(none: not checked)"}`);
    if (!mod) return; // this machine does not check this HOSxP screen
    showSave(ev, { kind: "checking", hn: ev.hn, module: mod.label });
    if (ev.hn) {
      // the patient's name for the badge/panel (the screen no longer shows it); same call as the Authen badge
      const hn = ev.hn;
      saveName = { hn, name: bar.hn === hn && bar.authen.state === "ok" ? bar.authen.name : null };
      if (!saveName.name)
        void fetchAuthen(cfg, hn).then((a) => {
          if (saveName?.hn !== hn) return;
          saveName.name = a?.name ?? null;
          if (bar.save && bar.save.kind !== "error" && bar.save.hn === hn) setBar({ save: { ...bar.save, name: saveName.name } });
        });
    }
    const outcome = await checker.check({ module: mod.code, hn: ev.hn, savedAt: ev.savedAt });
    if (outcome.kind === "cancelled") return; // a newer save took over
    if (outcome.kind === "denied") {
      // the admin changed this machine's modules since our last refresh: pick up the new list
      await modules.refresh();
    }
    const state = toAlert(mod.label, ev, outcome);
    log(`check result=${outcome.kind === "result" ? outcome.response.status : outcome.kind}`);
    showSave(ev, state);
    // the save may change the badges (Authen/close, RLU, opportunities): refetch while that patient is still on screen
    if (ev.hn && ev.hn === bar.hn) loadPatient(ev.hn);
  });
  watcher.start();
  app.on("before-quit", () => watcher.stop());
});

// background app: keep running when no panel window is open
app.on("window-all-closed", () => {});
