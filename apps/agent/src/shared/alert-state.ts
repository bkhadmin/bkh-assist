/** What the alert window shows. Sent main -> renderer over IPC. Never contains names/CID. */
export type AlertItem = { label: string; severity: "error" | "warning" };
/** Add-on service hint (patient qualifies for a billable service). Not missing data. */
/** price: baht from the HOSxP items set in admin; null/absent = no icode set */
export type AlertOpportunity = { category: string; label: string; price?: number | null };

export type AlertState =
  | { kind: "checking"; hn: string | null; module: string }
  | { kind: "ok"; hn: string | null; module: string; opportunities: AlertOpportunity[] }
  | { kind: "missing"; hn: string | null; module: string; items: AlertItem[]; opportunities: AlertOpportunity[] }
  | { kind: "ambiguous"; hn: string | null; module: string; count: number }
  | { kind: "error"; message: string };

/** Which panel of the lab window is open: HbA1c results or the "จัดเก็บ" opportunities. */
export type Panel = "hba1c" | "opps" | "ofc" | "authen" | "settings";
/** The settings panel ("ตั้งค่าจุดบริการ"): the modules an admin switched on, and the one this machine uses. */
export type ServicePoint =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; modules: { code: string; label: string; description: string | null }[]; selected: string[]; saving: boolean; saved: boolean };
/** What the top bar shows: the HN HOSxP displays right now (null = none), its HbA1c and opportunities. Never names/CID. */
export type TopbarStatus = {
  hn: string | null;
  /** the open panel window (its button shows as pressed), null = closed */
  panel: Panel | null;
  /** a newer agent version has been downloaded and can be installed (null = up to date) */
  update: string | null;
  /** last 3 results, newest first ("YYYY-MM-DD", value as reported) */
  hba1c: { state: "loading" } | { state: "error" } | { state: "ok"; results: { date: string; value: string }[] };
  /** NHSO Authen Code on the patient's latest visit ("YYYY-MM-DD"; null date = no visit) */
  authen: { state: "loading" } | { state: "error" } | { state: "ok"; name: string | null; visitDate: string | null; visitAt: string | null; authCode: string | null; hipdata: string | null };
  /** opportunities (e.g. PP) the patient's latest visit matches: the "จัดเก็บ" badge */
  opps: { state: "loading" } | { state: "error" } | { state: "ok"; items: AlertOpportunity[] };
};
/** top bar renderer -> main */
export type TopbarCommand = { type: "collapse" } | { type: "expand" } | { type: "panel"; panel: Panel | null } | { type: "update" };
/** What the panel window shows. Sent main -> lab renderer. */
export type LabView = { hn: string | null; panel: Panel; settings: ServicePoint; hba1c: TopbarStatus["hba1c"]; opps: TopbarStatus["opps"]; authen: TopbarStatus["authen"] };

/** renderer -> main */
export type AlertCommand =
  | { type: "dismiss" }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "resize"; width: number; height: number };
