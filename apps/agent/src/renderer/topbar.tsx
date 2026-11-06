import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Panel, TopbarCommand, TopbarStatus } from "../shared/alert-state";
import noviceUrl from "../../resources/novice.svg";
import { lightOf, thaiDate } from "./hba1c";
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

/** NHSO Authen Code of the latest visit: green ✓ / red ✕; grey when the latest visit is not today's. */
function AuthenBadge({ authen: a, active, onClick }: { authen: TopbarStatus["authen"]; active: boolean; onClick: () => void }) {
  const has = a.state === "ok" && a.authCode != null;
  const [tone, mark, title] =
    a.state === "loading" ? ["none", "…", "กำลังตรวจ Authen"]
    : a.state === "error" ? ["none", "?", "ตรวจ Authen ไม่ได้ (เชื่อมต่อ server ไม่ได้)"]
    : !a.visitDate ? ["none", "–", "ไม่พบ visit ของคนไข้นี้"]
    : a.visitDate !== today() ? ["none", has ? "✓" : "✕", `visit ล่าสุด ${thaiDate(a.visitDate)} ไม่ใช่วันนี้ (${has ? "มี" : "ไม่มี"} Authen)`]
    : has ? ["green", "✓", "visit วันนี้ขอ Authen แล้ว"]
    : ["red", "✕", "visit วันนี้ยังไม่ได้ขอ Authen Code จาก สปสช."];
  return (
    <button className={`authen ${tone} ${active ? "active" : ""}`} title={`${title} · คลิกดูรายละเอียด`} aria-expanded={active} onClick={onClick}>
      <span className="mark" aria-hidden="true">{mark}</span>
      Authen
    </button>
  );
}

function Topbar() {
  const [s, setS] = useState<TopbarStatus>({ hn: null, panel: null, update: null, authen: { state: "loading" }, hba1c: { state: "loading" }, opps: { state: "loading" } });
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

  const light =
    s.hba1c.state === "ok"
      ? lightOf(s.hba1c.results)
      : { tone: "none", why: s.hba1c.state === "loading" ? "กำลังโหลด HbA1c" : "ดึงผล HbA1c ไม่ได้" };

  return (
    <div className="bar">
      {hnText}
      {s.hn && <AuthenBadge authen={s.authen} active={s.panel === "authen"} onClick={() => togglePanel("authen")} />}
      {s.hn && (
        <button className={`lab ${s.panel === "hba1c" ? "active" : ""}`} title={`HbA1c: ${light.why}`} aria-expanded={s.panel === "hba1c"} onClick={() => togglePanel("hba1c")}>
          {/* key: a new patient or a new result restarts the blink (green 5×, red 10×; see topbar.css) */}
          <span key={`${s.hn}-${light.tone}`} className={`light ${light.tone}`} />
          HbA1c
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
