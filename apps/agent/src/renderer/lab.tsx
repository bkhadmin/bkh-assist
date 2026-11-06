import { HBA1C_MAX_AGE_DAYS } from "@bkh/shared";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LabView } from "../shared/alert-state";
import { daysAgo, lightOf, thaiDate } from "./hba1c";
import "./lab.css";

declare global {
  interface Window {
    bkhLab: { onView(cb: (v: LabView) => void): void; close(): void };
  }
}

function Lab() {
  const [v, setV] = useState<LabView | null>(null);
  useEffect(() => {
    window.bkhLab.onView(setV);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && window.bkhLab.close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!v) return null;
  const { hba1c } = v;
  const light = hba1c.state === "ok" ? lightOf(hba1c.results) : null;

  return (
    <section className="card" role="dialog" aria-labelledby="lab-title">
      <header className="head" title="ลากเพื่อย้าย">
        <div>
          <h1 id="lab-title">HbA1c · 3 ครั้งล่าสุด</h1>
          <p className="sub">HN {v.hn}</p>
        </div>
        <button className="close" title="ปิด (Esc)" aria-label="ปิด" onClick={() => window.bkhLab.close()}>
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      </header>

      {light && light.tone !== "none" && (
        <p className={`summary ${light.tone}`}>
          <span className="dot" />
          {light.why}
        </p>
      )}

      <div className="body">
        {hba1c.state === "loading" && <p className="msg">กำลังโหลด…</p>}
        {hba1c.state === "error" && <p className="msg">ดึงผลแล็บไม่ได้ (เชื่อมต่อ server ไม่ได้)</p>}
        {hba1c.state === "ok" && hba1c.results.length === 0 && <p className="msg">ยังไม่เคยตรวจ HbA1c</p>}
        {hba1c.state === "ok" && hba1c.results.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>วันที่สั่งตรวจ</th>
                <th>ผ่านมา</th>
                <th className="num">ผล (%)</th>
              </tr>
            </thead>
            <tbody>
              {hba1c.results.map((r, i) => (
                <tr key={i}>
                  <td>
                    {thaiDate(r.date)}
                    {i === 0 && <span className="latest">ล่าสุด</span>}
                  </td>
                  <td className="muted">{daysAgo(r.date)} วัน</td>
                  <td className="num value">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="foot">
        ไฟเขียวเมื่อตรวจครั้งล่าสุดไม่เกิน {HBA1C_MAX_AGE_DAYS} วัน เกินกว่านั้นเป็นไฟแดง
      </footer>
    </section>
  );
}

createRoot(document.getElementById("app")!).render(<Lab />);
