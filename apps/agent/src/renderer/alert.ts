import type { AlertCommand, AlertState } from "../shared/alert-state";

declare global {
  interface Window {
    bkh: {
      onState(cb: (msg: { state: AlertState; collapsed?: boolean }) => void): void;
      send(cmd: AlertCommand): void;
    };
  }
}

const root = document.getElementById("root")!;
const OK_HIDE_MS = 2600;
const ERROR_HIDE_MS = 6000;
const COLLAPSE_AFTER_MS = 20000;

let state: AlertState | null = null;
let collapsed = false;
let timer: number | undefined;

const icons = {
  check: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>`,
  spinner: `<svg class="spin" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2a6 6 0 1 1-6 6" /></svg>`,
  offline: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.8v3.6M8 11h.01"/></svg>`,
  warn: (size: number) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none"><path d="M10 2.8 18 16.5H2L10 2.8Z" fill="currentColor" opacity=".16"/><path d="M10 2.8 18 16.5H2L10 2.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 8v3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="13.9" r="1" fill="currentColor"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg>`,
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hnText = (hn: string | null) => (hn ? `HN <b>${esc(hn)}</b>` : "ไม่ทราบ HN");
const clock = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

function pill(cls: string, icon: string, text: string, sub: string) {
  return `<div class="pill ${cls} enter" role="status"><span class="dot">${icon}</span><span class="text">${text}</span><span class="sub">${sub}</span></div>`;
}

function render() {
  clearTimeout(timer);
  if (!state) return;
  const s = state;

  if (s.kind === "checking") {
    root.innerHTML = pill("checking", icons.spinner, "กำลังตรวจข้อมูล", `· ${hnText(s.hn)}`);
  } else if (s.kind === "ok") {
    root.innerHTML = pill("ok", icons.check, "บันทึกครบถ้วน", `· ${hnText(s.hn)}`);
    timer = window.setTimeout(() => window.bkh.send({ type: "dismiss" }), OK_HIDE_MS);
  } else if (s.kind === "error") {
    root.innerHTML = pill("error", icons.offline, "ตรวจข้อมูลไม่ได้", `· ${esc(s.message)}`);
    timer = window.setTimeout(() => window.bkh.send({ type: "dismiss" }), ERROR_HIDE_MS);
  } else if (s.kind === "missing") {
    const errors = s.items.filter((i) => i.severity === "error").length;
    const tone = errors === 0 ? "warn-only" : "";
    if (collapsed) {
      const who = s.hn ? `<span class="mini-hn">HN ${esc(s.hn)}</span>` : "";
      root.innerHTML = `<button class="mini ${tone} enter" id="expand" title="ดูรายการที่ยังไม่ครบ">${icons.warn(18)}${who}<span>ขาด <span class="count">${s.items.length}</span></span></button>`;
    } else {
      const items = s.items
        .map((i) => `<li class="item ${i.severity}"><span class="mark"></span><span class="label">${esc(i.label)}</span><span class="tag">${i.severity === "error" ? "จำเป็น" : "ควรมี"}</span></li>`)
        .join("");
      root.innerHTML = `
        <section class="card ${tone} enter" role="alert">
          <header class="head">
            <span class="badge-icon">${icons.warn(20)}</span>
            <div class="titles">
              <div class="title">${errors ? "ข้อมูลยังไม่ครบ" : "ควรบันทึกเพิ่ม"} ${s.items.length} รายการ</div>
              <div class="meta">${hnText(s.hn)} · ${esc(s.module)} · ${clock()} น.</div>
            </div>
            <button class="icon-btn" id="collapse" title="ย่อ" aria-label="ย่อ">${icons.close}</button>
          </header>
          <ul class="list">${items}</ul>
          <footer class="foot">
            <span class="hint">กรอกเพิ่มใน HOSxP แล้วกดบันทึกอีกครั้ง</span>
            <button class="btn" id="dismiss">รับทราบ</button>
          </footer>
        </section>`;
      timer = window.setTimeout(() => setCollapsed(true), COLLAPSE_AFTER_MS);
    }
  } else if (s.kind === "ambiguous") {
    root.innerHTML = `
      <section class="card ambiguous enter" role="alert">
        <header class="head">
          <span class="badge-icon">${icons.warn(20)}</span>
          <div class="titles">
            <div class="title">ระบุผู้ป่วยไม่ได้</div>
            <div class="meta">${hnText(s.hn)} · ${esc(s.module)} · ${clock()} น.</div>
          </div>
        </header>
        <p class="body-text">พบการบันทึก ${s.count} รายการในช่วงเวลาเดียวกัน จึงยังไม่ได้ตรวจความครบถ้วน</p>
        <footer class="foot"><span class="hint"></span><button class="btn" id="dismiss">รับทราบ</button></footer>
      </section>`;
  }

  root.querySelector("#dismiss")?.addEventListener("click", () => window.bkh.send({ type: "dismiss" }));
  root.querySelector("#collapse")?.addEventListener("click", () => setCollapsed(true));
  root.querySelector("#expand")?.addEventListener("click", () => setCollapsed(false));
  // Measure synchronously: requestAnimationFrame never fires while the window is hidden,
  // so waiting for it would keep a hidden alert hidden forever.
  reportSize();
}

function setCollapsed(v: boolean) {
  collapsed = v;
  render();
}

function reportSize() {
  const r = root.getBoundingClientRect();
  const pad = 28; // body padding (shadow room) on both sides
  window.bkh.send({ type: "resize", width: Math.ceil(r.width) + pad, height: Math.ceil(r.height) + pad });
}

window.bkh.onState((msg) => {
  state = msg.state;
  collapsed = msg.collapsed ?? false;
  render();
});
