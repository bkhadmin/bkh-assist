import { HBA1C_MAX_AGE_DAYS } from "@bkh/shared";
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { LabView } from "../shared/alert-state";
import { daysAgo, lightOf, thaiDate } from "./hba1c";
import { baht, priceSum } from "./money";
import "./lab.css";

declare global {
  interface Window {
    bkhLab: { onView(cb: (v: LabView) => void): void; close(): void; setServicePoint(code: string): void };
  }
}

const Msg = ({ children }: { children: ReactNode }) => <p className="msg">{children}</p>;
const ERROR = "ดึงข้อมูลไม่ได้ (เชื่อมต่อ server ไม่ได้)";

function HbA1c({ hba1c }: { hba1c: LabView["hba1c"] }) {
  if (hba1c.state === "loading") return <Msg>กำลังโหลด…</Msg>;
  if (hba1c.state === "error") return <Msg>{ERROR}</Msg>;
  if (hba1c.results.length === 0) return <Msg>ยังไม่เคยตรวจ HbA1c</Msg>;
  const light = lightOf(hba1c.results);
  return (
    <>
      <p className={`summary ${light.tone}`}>
        <span className="dot" />
        {light.why}
      </p>
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
    </>
  );
}

/** "งาน PP" (every category but OFC) or the OFC list. */
/** Items of the "งาน PP" (non-OFC) or "OFC" panel. */
const panelItems = (opps: LabView["opps"], ofc: boolean) => (opps.state === "ok" ? opps.items.filter((o) => (o.category === "OFC") === ofc) : []);

function Opps({ opps, ofc }: { opps: LabView["opps"]; ofc: boolean }) {
  if (opps.state === "loading") return <Msg>กำลังตรวจ…</Msg>;
  if (opps.state === "error") return <Msg>{ERROR}</Msg>;
  const items = panelItems(opps, ofc);
  if (items.length === 0)
    return (
      <Msg>
        {ofc
          ? "ยังไม่มีรายการ OFC ที่เข้าเกณฑ์ (admin เพิ่ม/เปิดรายการหมวด OFC และเปิดตัวเลือกเสริมของ module ได้ที่หน้า admin)"
          : "visit ล่าสุดของคนไข้นี้ไม่เข้าเกณฑ์รายการที่เปิดไว้"}
      </Msg>
    );
  return (
    <ul className="opps">
      {items.map((o, i) => (
        <li key={i}>
          <span className="cat">{o.category}</span>
          <span className="label">{o.label}</span>
          {o.price != null ? <span className="price">{baht(o.price)}</span> : <span className="price none" title="ยังไม่ได้ตั้ง icode ค่าบริการในหน้า admin">–</span>}
        </li>
      ))}
    </ul>
  );
}

/** NHSO Authen of the latest visit: code + time, or a red "not authenticated" notice. */
function Authen({ authen: a }: { authen: LabView["authen"] }) {
  if (a.state === "loading") return <Msg>กำลังตรวจ…</Msg>;
  if (a.state === "error") return <Msg>{ERROR}</Msg>;
  if (!a.visitAt) return <Msg>ไม่พบ visit ของคนไข้นี้</Msg>;
  const [date, time] = a.visitAt.split(" ");
  const when = `${thaiDate(date)} เวลา ${time} น.`;
  if (!a.authCode)
    return (
      <>
        <p className="summary red">
          <span className="dot" />
          คนไข้รายนี้ยังไม่ผ่านการ authen
        </p>
        <dl className="facts">
          <dt>visit</dt>
          <dd>{when}</dd>
        </dl>
      </>
    );
  return (
    <>
      <p className="summary green">
        <span className="dot" />
        ผ่านการ authen แล้ว
      </p>
      <dl className="facts">
        <dt>เลข Authen</dt>
        <dd className="code">{a.authCode}</dd>
        <dt>วันเวลา</dt>
        <dd>
          {when}
          <span className="note">เวลามารับบริการ: HOSxP ไม่ได้บันทึกเวลาที่ขอ Authen</span>
        </dd>
      </dl>
    </>
  );
}

/** "ตั้งค่าจุดบริการ": pick the module (service point) this machine checks. */
function Settings({ settings: st }: { settings: LabView["settings"] }) {
  const [choice, setChoice] = useState<string | null>(null);
  if (st.state === "loading") return <Msg>กำลังโหลด…</Msg>;
  if (st.state === "error") return <Msg>{st.message}</Msg>;
  if (st.modules.length === 0) return <Msg>admin ยังไม่ได้เปิด module ใด</Msg>;
  const current = st.selected[0] ?? null;
  const picked = choice ?? current;
  return (
    <form
      className="points"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked && picked !== current) window.bkhLab.setServicePoint(picked);
      }}
    >
      <fieldset disabled={st.saving}>
        <legend>จุดบริการของเครื่องนี้</legend>
        {st.modules.map((m) => (
          <label key={m.code} className={`point ${picked === m.code ? "picked" : ""}`}>
            <input type="radio" name="point" value={m.code} checked={picked === m.code} onChange={() => setChoice(m.code)} />
            <span>
              <b>{m.label}</b>
              {m.code === current && <span className="latest">ใช้อยู่</span>}
              {m.description && <small>{m.description}</small>}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        {st.saved && picked === current && <span className="ok">บันทึกแล้ว ใช้ตรวจตั้งแต่การบันทึกครั้งถัดไป</span>}
        <button type="submit" className="primary" disabled={st.saving || !picked || picked === current}>
          {st.saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

const PANELS = {
  hba1c: { title: "HbA1c · 3 ครั้งล่าสุด", foot: `ไฟเขียวเมื่อตรวจครั้งล่าสุดไม่เกิน ${HBA1C_MAX_AGE_DAYS} วัน เกินกว่านั้นเป็นไฟแดง` },
  ofc: { title: "สิทธิกรมบัญชีกลาง (OFC) · ควรให้บริการเพิ่ม", foot: "สิทธิ OFC เบิกตามรายการบริการ · รายการแก้ได้ที่หน้า admin › โอกาสเพิ่มรายได้ หมวด OFC" },
  settings: { title: "ตั้งค่าจุดบริการ", foot: "เลือก module ที่เครื่องนี้ใช้ตรวจการบันทึก (รายการจาก module ที่ admin เปิดไว้)" },
  authen: { title: "Authen · สปสช.", foot: "ดูจาก visit ล่าสุดของคนไข้ (visit_pttype.auth_code)" },
  opps: { title: "งาน PP · บริการที่เข้าเกณฑ์", foot: "ประเมินจาก visit ล่าสุด ตามรายการที่ admin เปิดไว้ใน module ของเครื่องนี้" },
};

function Lab() {
  const [v, setV] = useState<LabView | null>(null);
  useEffect(() => {
    window.bkhLab.onView(setV);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && window.bkhLab.close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!v) return null;
  const p = PANELS[v.panel];

  return (
    <section className="card" role="dialog" aria-labelledby="lab-title">
      <header className="head" title="ลากเพื่อย้าย">
        <div>
          <h1 id="lab-title">{p.title}</h1>
          {v.panel !== "settings" && <p className="sub">HN {v.hn}</p>}
        </div>
        <button className="close" title="ปิด (Esc)" aria-label="ปิด" onClick={() => window.bkhLab.close()}>
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      </header>
      <div className="body">
        {v.panel === "hba1c" ? (
          <HbA1c hba1c={v.hba1c} />
        ) : v.panel === "authen" ? (
          <Authen authen={v.authen} />
        ) : v.panel === "settings" ? (
          <Settings settings={v.settings} />
        ) : (
          <Opps opps={v.opps} ofc={v.panel === "ofc"} />
        )}
      </div>
      {(v.panel === "opps" || v.panel === "ofc") && panelItems(v.opps, v.panel === "ofc").length > 0 && (
        <div className="total">
          <span>รวมค่าบริการที่จัดเก็บได้</span>
          <b>{baht(priceSum(panelItems(v.opps, v.panel === "ofc")))}</b>
        </div>
      )}
      <footer className="foot">{p.foot}</footer>
    </section>
  );
}

createRoot(document.getElementById("app")!).render(<Lab />);
