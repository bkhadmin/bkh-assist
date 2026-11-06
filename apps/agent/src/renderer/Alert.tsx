import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AlertCommand, AlertOpportunity, AlertState } from "../shared/alert-state";

declare global {
  interface Window {
    bkh: {
      onState(cb: (msg: { state: AlertState; collapsed?: boolean }) => void): void;
      send(cmd: AlertCommand): void;
    };
  }
}

const OK_HIDE_MS = 2600;
const ERROR_HIDE_MS = 6000;
const COLLAPSE_AFTER_MS = 20000;

const send = (cmd: AlertCommand) => window.bkh.send(cmd);
const dismiss = () => send({ type: "dismiss" });
const clock = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
const SpinnerIcon = () => (
  <svg className="spin" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 2a6 6 0 1 1-6 6" />
  </svg>
);
const OfflineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8v3.6M8 11h.01" />
  </svg>
);
const WarnIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M10 2.8 18 16.5H2L10 2.8Z" fill="currentColor" opacity=".16" />
    <path d="M10 2.8 18 16.5H2L10 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M10 8v3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="10" cy="13.9" r="1" fill="currentColor" />
  </svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
  </svg>
);

const HnText = ({ hn }: { hn: string | null }) => (hn ? <>HN <b>{hn}</b></> : <>ไม่ทราบ HN</>);
const MiniHn = ({ hn }: { hn: string | null }) => (hn ? <span className="mini-hn">HN {hn}</span> : null);

function Pill({ cls, icon, text, sub }: { cls: string; icon: ReactNode; text: string; sub: ReactNode }) {
  return (
    <div className={`pill ${cls} enter`} role="status">
      <span className="dot">{icon}</span>
      <span className="text">{text}</span>
      <span className="sub">· {sub}</span>
    </div>
  );
}

function Card(props: {
  cls: string;
  role: "alert" | "status";
  icon: ReactNode;
  title: string;
  hn: string | null;
  module: string;
  onCollapse?: () => void;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${props.cls} enter`} role={props.role}>
      <header className="head">
        <span className="badge-icon">{props.icon}</span>
        <div className="titles">
          <div className="title">{props.title}</div>
          <div className="meta">
            <HnText hn={props.hn} /> · {props.module} · {clock()} น.
          </div>
        </div>
        {props.onCollapse && (
          <button className="icon-btn" title="ย่อ" aria-label="ย่อ" onClick={props.onCollapse}>
            <CloseIcon />
          </button>
        )}
      </header>
      {props.children}
      <footer className="foot">
        <span className="hint">{props.hint}</span>
        <button className="btn" onClick={dismiss}>
          รับทราบ
        </button>
      </footer>
    </section>
  );
}

function OppList({ opps }: { opps: AlertOpportunity[] }) {
  return (
    <ul className="list">
      {opps.map((o, i) => (
        <li key={i} className="item opp">
          <span className="tag cat">{o.category}</span>
          <span className="label">{o.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** "PP 2 · X 1" per category, for the collapsed ok badge. */
function OppCounts({ opps }: { opps: AlertOpportunity[] }) {
  const n = new Map<string, number>();
  for (const o of opps) n.set(o.category, (n.get(o.category) ?? 0) + 1);
  return (
    <span>
      {[...n].map(([c, k], i) => (
        <span key={c}>
          {i > 0 && " · "}
          {c} <span className="count">{k}</span>
        </span>
      ))}
    </span>
  );
}

/** One alert state. Timers restart whenever the state or the collapsed flag changes (key-less on purpose). */
export function Alert({ state: s, collapsed, setCollapsed }: { state: AlertState; collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const okPill = s.kind === "ok" && s.opportunities.length === 0;

  // Measure synchronously after the DOM update: requestAnimationFrame never fires while the window is hidden,
  // so waiting for it would keep a hidden alert hidden forever. The main process positions/shows the window.
  useLayoutEffect(() => {
    const r = rootRef.current!.getBoundingClientRect();
    const pad = 28; // body padding (shadow room) on both sides
    send({ type: "resize", width: Math.ceil(r.width) + pad, height: Math.ceil(r.height) + pad });
  });

  useEffect(() => {
    let t: number | undefined;
    if (okPill) t = window.setTimeout(dismiss, OK_HIDE_MS);
    else if (s.kind === "error") t = window.setTimeout(dismiss, ERROR_HIDE_MS);
    else if ((s.kind === "ok" || s.kind === "missing") && !collapsed) t = window.setTimeout(() => setCollapsed(true), COLLAPSE_AFTER_MS);
    return () => clearTimeout(t);
  }, [s, collapsed, okPill, setCollapsed]);

  let body: ReactNode = null;
  if (s.kind === "checking") {
    body = <Pill cls="checking" icon={<SpinnerIcon />} text="กำลังตรวจข้อมูล" sub={<HnText hn={s.hn} />} />;
  } else if (s.kind === "error") {
    body = <Pill cls="error" icon={<OfflineIcon />} text="ตรวจข้อมูลไม่ได้" sub={s.message} />;
  } else if (okPill) {
    body = <Pill cls="ok" icon={<CheckIcon />} text="บันทึกครบถ้วน" sub={<HnText hn={s.hn} />} />;
  } else if (s.kind === "ok") {
    body = collapsed ? (
      <button className="mini opp enter" title="ดูโอกาสให้บริการเพิ่ม" onClick={() => setCollapsed(false)}>
        <CheckIcon />
        <MiniHn hn={s.hn} />
        <OppCounts opps={s.opportunities} />
      </button>
    ) : (
      <Card cls="opp" role="status" icon={<CheckIcon />} title="บันทึกครบ · ทำบริการเพิ่มได้" hn={s.hn} module={s.module}
        onCollapse={() => setCollapsed(true)} hint="ข้อมูลครบแล้ว · พิจารณาให้บริการเพิ่มตามสิทธิ์">
        <OppList opps={s.opportunities} />
      </Card>
    );
  } else if (s.kind === "missing") {
    const errors = s.items.filter((i) => i.severity === "error").length;
    const tone = errors === 0 ? "warn-only" : "";
    body = collapsed ? (
      <button className={`mini ${tone} enter`} title="ดูรายการที่ยังไม่ครบ" onClick={() => setCollapsed(false)}>
        <WarnIcon size={18} />
        <MiniHn hn={s.hn} />
        <span>
          ขาด <span className="count">{s.items.length}</span>
        </span>
      </button>
    ) : (
      <Card cls={tone} role="alert" icon={<WarnIcon size={20} />} title={`${errors ? "ข้อมูลยังไม่ครบ" : "ควรบันทึกเพิ่ม"} ${s.items.length} รายการ`}
        hn={s.hn} module={s.module} onCollapse={() => setCollapsed(true)} hint="กรอกเพิ่มใน HOSxP แล้วกดบันทึกอีกครั้ง">
        <ul className="list">
          {s.items.map((i, k) => (
            <li key={k} className={`item ${i.severity}`}>
              <span className="mark" />
              <span className="label">{i.label}</span>
              <span className="tag">{i.severity === "error" ? "จำเป็น" : "ควรมี"}</span>
            </li>
          ))}
        </ul>
        {s.opportunities.length > 0 && (
          <>
            <div className="sec-head">โอกาสให้บริการเพิ่ม</div>
            <OppList opps={s.opportunities} />
          </>
        )}
      </Card>
    );
  } else if (s.kind === "ambiguous") {
    body = (
      <Card cls="ambiguous" role="alert" icon={<WarnIcon size={20} />} title="ระบุผู้ป่วยไม่ได้" hn={s.hn} module={s.module} hint="">
        <p className="body-text">พบการบันทึก {s.count} รายการในช่วงเวลาเดียวกัน จึงยังไม่ได้ตรวจความครบถ้วน</p>
      </Card>
    );
  }

  return (
    <div id="root" ref={rootRef} aria-live="polite">
      {body}
    </div>
  );
}
