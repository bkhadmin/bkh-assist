import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Panel, SaveCheck, TopbarCommand, TopbarStatus } from "../shared/alert-state";
import noviceUrl from "../../resources/novice.svg";
import { thaiDate } from "./dates";
import { baht, priceSum } from "./money";
import "./topbar.css";

declare global {
  interface Window {
    bkhTop: {
      onStatus(cb: (s: TopbarStatus) => void): void;
      onCollapsed(cb: (v: boolean) => void): void;
      send(cmd: TopbarCommand): void;
    };
  }
}

const send = (cmd: TopbarCommand) => window.bkhTop.send(cmd);

const Chevron = ({ up }: { up: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} />
  </svg>
);

/** The novice monk icon (resources/novice.svg), same as the tray and app icon. */
const AppIcon = () => <img className="tab-icon" src={noviceUrl} alt="" width={18} height={18} />;

const today = () => new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD", local

/**
 * NHSO "ปิดสิทธิ" of the latest visit: green ✓ closed / red ✕ not closed yet (UCS visit today) / amber ! cancelled;
 * grey for other rights (they are normally not closed with NHSO) and when the latest visit is not today's.
 */
function CloseBadge({ authen: a, active, onClick }: { authen: TopbarStatus["authen"]; active: boolean; onClick: () => void }) {
  const c = a.state === "ok" ? a.close : null;
  const [tone, mark, title] =
    a.state === "loading" ? ["none", "…", "กำลังตรวจการปิดสิทธิ"]
    : a.state === "error" ? ["none", "?", "ตรวจการปิดสิทธิไม่ได้ (เชื่อมต่อ server ไม่ได้)"]
    : !a.visitDate ? ["none", "–", "ไม่พบ visit ของคนไข้นี้"]
    : a.visitDate !== today() ? ["none", c?.status === "closed" ? "✓" : "–", `visit ล่าสุด ${thaiDate(a.visitDate)} ไม่ใช่วันนี้`]
    : c?.status === "closed" ? ["green", "✓", "ปิดสิทธิ สปสช. แล้ว"]
    : c?.status === "cancelled" ? ["amber", "!", "ยกเลิกการปิดสิทธิแล้ว ยังไม่ได้ปิดใหม่"]
    : a.hipdata === "UCS" ? ["red", "✕", "visit วันนี้ (สิทธิ UCS) ยังไม่ได้ปิดสิทธิ สปสช."]
    : ["none", "–", `สิทธิ ${a.hipdata ?? "-"}: ปกติไม่ต้องปิดสิทธิ สปสช.`];
  return (
    <button className={`authen ${tone} ${active ? "active" : ""}`} title={`${title} · คลิกดูรายละเอียด`} aria-expanded={active} onClick={onClick}>
      <span className="mark" aria-hidden="true">{mark}</span>
      ปิดสิทธิ
    </button>
  );
}

/** Latest HOSxP save check: red blinking "ไม่ครบ n" / amber "ควรเพิ่ม n" / green "บันทึกครบ"; click opens the large panel. */
function SaveBadge({ save: c, screenHn, active, onClick }: { save: SaveCheck; screenHn: string | null; active: boolean; onClick: () => void }) {
  const errors = c.kind === "missing" ? c.items.filter((i) => i.severity === "error").length : 0;
  // HOSxP clears the screen after saving: name the saved patient when it is not the one on screen
  const who = c.kind !== "error" && c.hn && c.hn !== screenHn ? c.hn : null;
  const whoTitle = c.kind !== "error" && c.hn ? `HN ${c.hn}${c.name ? ` ${c.name}` : ""} · ` : "";
  const [tone, mark, text, title] =
    c.kind === "checking" ? ["none", "…", "กำลังตรวจ", "กำลังตรวจการบันทึก"]
    : c.kind === "ok" ? ["green", "✓", "บันทึกครบ", `บันทึกครบถ้วน (${c.at} น.)`]
    : c.kind === "missing" && errors ? ["red", "!", `ไม่ครบ ${c.items.length}`, `ข้อมูลยังไม่ครบ ${c.items.length} รายการ (${c.at} น.)`]
    : c.kind === "missing" ? ["amber", "!", `ควรเพิ่ม ${c.items.length}`, `ควรบันทึกเพิ่ม ${c.items.length} รายการ (${c.at} น.)`]
    : c.kind === "ambiguous" ? ["amber", "?", "ตรวจไม่ได้", "มีหลาย visit ตรวจอัตโนมัติไม่ได้"]
    : ["none", "!", "ตรวจไม่ได้", "ตรวจการบันทึกไม่ได้"];
  return (
    <button className={`save ${tone} ${active ? "active" : ""}`} title={`${whoTitle}${title} · คลิกดูรายละเอียด`} aria-expanded={active} onClick={onClick}>
      {/* key: every new check restarts the blink (red 10×; see topbar.css) */}
      <span key={`${c.at}-${c.kind}`} className="mark" aria-hidden="true">{mark}</span>
      {who && <span className="who">HN {who}</span>}
      {text}
    </button>
  );
}

function Topbar() {
  const [s, setS] = useState<TopbarStatus>({ hn: null, panel: null, update: null, blind: false, save: null, authen: { state: "loading" }, rlu: { state: "loading" }, rdu: { state: "loading" }, opps: { state: "loading" } });
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    window.bkhTop.onStatus(setS);
    window.bkhTop.onCollapsed(setCollapsed);
  }, []);

  const hnText = s.hn && (
    <span className="hn">
      HN <b>{s.hn}</b>
      {s.authen.state === "ok" && s.authen.name && <span className="name">{s.authen.name}</span>}
    </span>
  );

  if (collapsed) {
    return (
      <button className="tab" title="ขยายแถบเตือนสติ" aria-label="ขยายแถบเตือนสติ" onClick={() => send({ type: "expand" })}>
        <AppIcon />
        <span className="tab-label">เตือนสติ</span>
        <Chevron up={false} />
      </button>
    );
  }

  const togglePanel = (panel: Panel) => send({ type: "panel", panel: s.panel === panel ? null : panel });
  // OFC items have their own button; "จัดเก็บ" counts the rest (PP …)
  const oppItems = s.opps.state === "ok" ? s.opps.items.filter((o) => o.category !== "OFC") : null;
  const ofcItems = s.opps.state === "ok" ? s.opps.items.filter((o) => o.category === "OFC") : [];
  const oppCount = oppItems?.length ?? null;
  const ofcCount = ofcItems.length;
  const oppSum = oppItems ? priceSum(oppItems) : 0;
  const ofcSum = priceSum(ofcItems);

  // RLU: red when any item warns, green when none does; grey while loading, on error or with no item set in admin
  const rluWarn = s.rlu.state === "ok" ? s.rlu.items.filter((i) => i.warn) : [];
  const rluTone = s.rlu.state !== "ok" || s.rlu.items.length === 0 ? "none" : rluWarn.length ? "red" : "green";
  const rluWhy =
    s.rlu.state === "loading" ? "กำลังตรวจ RLU"
    : s.rlu.state === "error" ? "ตรวจ RLU ไม่ได้ (เชื่อมต่อ server ไม่ได้)"
    : s.rlu.items.length === 0 ? "ยังไม่มีรายการ RLU"
    : rluWarn.length ? `เตือน: ${rluWarn.map((i) => i.label).join(", ")}`
    : "ไม่มีรายการที่เข้าเกณฑ์เตือน";
  // RDU: amber when the visit's saved drugs/diagnoses hit a rule, green when none; grey while loading or on error
  const rduHits = s.rdu.state === "ok" ? s.rdu.hits : [];
  const rduTone = s.rdu.state !== "ok" ? "none" : rduHits.length ? "amber" : "green";
  const rduWhy =
    s.rdu.state === "loading" ? "กำลังตรวจ RDU"
    : s.rdu.state === "error" ? "ตรวจ RDU ไม่ได้ (เชื่อมต่อ server ไม่ได้)"
    : rduHits.length ? `เข้าเกณฑ์: ${rduHits.map((h) => h.label).join(", ")}`
    : "ไม่มีรายการที่เข้าเกณฑ์ RDU";

  return (
    <div className="bar">
      {hnText}
      {s.blind && (
        <span
          className="blind"
          role="alert"
          title="HOSxP เปิดแบบ Run as administrator แต่เตือนสติไม่ได้รันด้วยสิทธิ์ Admin จึงมองไม่เห็นการกดบันทึก · ปิดเตือนสติแล้วเปิดใหม่ด้วยสิทธิ์ Admin (ตัวที่ติดตั้งจะรันเป็น Admin เองตอนเข้าเครื่อง) หรือเปิด HOSxP แบบปกติ"
        >
          ⚠ ตรวจการบันทึกไม่ได้
        </span>
      )}
      {s.save && <SaveBadge save={s.save} screenHn={s.hn} active={s.panel === "save"} onClick={() => togglePanel("save")} />}
      {s.hn && <CloseBadge authen={s.authen} active={s.panel === "authen"} onClick={() => togglePanel("authen")} />}
      {s.hn && (
        <button
          className={`lab ${s.panel === "rlu" ? "active" : ""}`}
          title={`RLU (การใช้ LAB อย่างสมเหตุผล): ${rluWhy} · คลิกดูรายการ`}
          aria-expanded={s.panel === "rlu"}
          aria-haspopup="dialog"
          onClick={() => togglePanel("rlu")}
        >
          {/* key: a new patient or a new warning state restarts the blink (green 5×, red 10×; see topbar.css) */}
          <span key={`${s.hn}-${rluTone}-${rluWarn.length}`} className={`light ${rluTone}`} />
          RLU
          {rluWarn.length > 0 && <span className="count">{rluWarn.length}</span>}
        </button>
      )}
      {s.hn && (
        <button
          className={`lab ${s.panel === "rdu" ? "active" : ""}`}
          title={`RDU (การใช้ยาอย่างสมเหตุผล): ${rduWhy} · คลิกดูรายการ`}
          aria-expanded={s.panel === "rdu"}
          onClick={() => togglePanel("rdu")}
        >
          <span key={`${s.hn}-${rduTone}-${rduHits.length}`} className={`light ${rduTone}`} />
          RDU
          {rduHits.length > 0 && <span className="count amber">{rduHits.length}</span>}
        </button>
      )}
      <span className="grow" />
      {s.authen.state === "ok" && s.authen.hipdata === "OFC" && (
        <button
          className={`ofc ${s.panel === "ofc" ? "active" : ""}`}
          title="สิทธิกรมบัญชีกลาง (OFC): เบิกตามรายการบริการได้ · คลิกดูรายการที่ควรให้บริการเพิ่ม"
          aria-expanded={s.panel === "ofc"}
          onClick={() => togglePanel("ofc")}
        >
          OFC · ให้บริการเพิ่มได้{ofcCount ? <span className="count">{ofcCount}</span> : null}
          {ofcSum > 0 && <span className="sum">{baht(ofcSum)}</span>}
        </button>
      )}
      {s.hn && (
        <button
          className={`collect ${oppCount ? "has" : ""} ${s.panel === "opps" ? "active" : ""}`}
          title={oppCount == null ? (s.opps.state === "loading" ? "กำลังตรวจงาน PP" : "ตรวจงาน PP ไม่ได้") : `งาน PP ที่เข้าเกณฑ์ ${oppCount} รายการ${oppSum > 0 ? ` รวม ${baht(oppSum)}` : ""}`}
          aria-expanded={s.panel === "opps"}
          onClick={() => togglePanel("opps")}
        >
          งาน PP <span className="count">{oppCount ?? "–"}</span>
          {oppSum > 0 && <span className="sum">{baht(oppSum)}</span>}
        </button>
      )}
      {s.update && (
        <button className="update" title={`ติดตั้งเวอร์ชัน ${s.update} แล้วเปิดใหม่ (ใช้เวลาไม่กี่วินาที)`} onClick={() => send({ type: "update" })}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 2v7M3.8 6 7 9.2 10.2 6M2.5 12h9" />
          </svg>
          อัปเดต v{s.update}
        </button>
      )}
      <button
        className={`icon ${s.panel === "settings" ? "on" : ""}`}
        title="ตั้งค่าจุดบริการ"
        aria-label="ตั้งค่าจุดบริการ"
        aria-expanded={s.panel === "settings"}
        onClick={() => togglePanel("settings")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <button className="icon" title="ย่อแถบ (คืนพื้นที่หน้าจอ)" aria-label="ย่อแถบ" onClick={() => send({ type: "collapse" })}>
        <Chevron up />
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Topbar />);
