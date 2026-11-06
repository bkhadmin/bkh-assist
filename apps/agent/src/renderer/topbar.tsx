import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TopbarCommand, TopbarStatus } from "../shared/alert-state";
import noviceUrl from "../../resources/novice.svg";
import { lightOf } from "./hba1c";
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

function Topbar() {
  const [s, setS] = useState<TopbarStatus>({ hn: null, labOpen: false, update: null, hba1c: { state: "loading" } });
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    window.bkhTop.onStatus(setS);
    window.bkhTop.onCollapsed(setCollapsed);
  }, []);

  const hnText = s.hn && (
    <span className="hn">
      HN <b>{s.hn}</b>
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

  const light =
    s.hba1c.state === "ok"
      ? lightOf(s.hba1c.results)
      : { tone: "none", why: s.hba1c.state === "loading" ? "กำลังโหลด HbA1c" : "ดึงผล HbA1c ไม่ได้" };

  return (
    <div className="bar">
      {hnText}
      {s.hn && (
        <button className={`lab ${s.labOpen ? "active" : ""}`} title={`HbA1c: ${light.why}`} aria-expanded={s.labOpen} onClick={() => send({ type: "lab", open: !s.labOpen })}>
          {/* key: a new patient or a new result restarts the blink (green 5×, red 10×; see topbar.css) */}
          <span key={`${s.hn}-${light.tone}`} className={`light ${light.tone}`} />
          HbA1c
        </button>
      )}
      <span className="grow" />
      {s.update && (
        <button className="update" title={`ติดตั้งเวอร์ชัน ${s.update} แล้วเปิดใหม่ (ใช้เวลาไม่กี่วินาที)`} onClick={() => send({ type: "update" })}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 2v7M3.8 6 7 9.2 10.2 6M2.5 12h9" />
          </svg>
          อัปเดต v{s.update}
        </button>
      )}
      <button className="icon" title="ย่อแถบ (คืนพื้นที่หน้าจอ)" aria-label="ย่อแถบ" onClick={() => send({ type: "collapse" })}>
        <Chevron up />
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Topbar />);
