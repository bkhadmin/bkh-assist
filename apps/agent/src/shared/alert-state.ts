import type { AgentAuthenResponse, Opportunity, RduHit, RluItem } from "@bkh/shared";

/** A missing / should-have field of a save check. Never contains names/CID. */
export type AlertItem = { label: string; severity: "error" | "warning" };
/** Add-on service hint (patient qualifies for a billable service). Not missing data. */
/** price: baht from the HOSxP items set in admin; null/absent = no icode set */
export type AlertOpportunity = { category: string; label: string; price?: number | null; detail?: Opportunity["detail"] };

/** Result of a HOSxP save check. Shown only on the top bar ("บันทึก" badge) and its large panel. */
export type AlertState =
  | { kind: "checking"; hn: string | null; module: string }
  | { kind: "ok"; hn: string | null; module: string; opportunities: AlertOpportunity[] }
  | { kind: "missing"; hn: string | null; module: string; items: AlertItem[]; opportunities: AlertOpportunity[] }
  | { kind: "ambiguous"; hn: string | null; module: string; count: number }
  | { kind: "error"; message: string };
/**
 * The latest save check, kept for the SAVED patient (HOSxP clears the screen after F9, so it outlives the HN on
 * screen): time of the save ("HH:mm") and that patient's name (null until fetched / unknown).
 */
export type SaveCheck = AlertState & { at: string; name: string | null };

/** Which panel of the lab window is open; "rlu" is a dropdown anchored under its top bar badge; "warn" is the warning popup. */
export type Panel = "save" | "rlu" | "rdu" | "opps" | "ofc" | "authen" | "settings" | "warn";
/** A warning popup (any module). Lines starting with "•" are an item's headline, the others its muted detail. */
export type Warning = { title: string; hn: string | null; lines: string[] };
/** The settings panel ("ตั้งค่าจุดบริการ"): the modules an admin switched on, and the one this machine uses. */
export type ServicePoint =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; modules: { code: string; label: string; description: string | null }[]; selected: string[]; saving: boolean; saved: boolean };
/** What the top bar shows: the HN HOSxP displays right now (null = none), its RLU items and opportunities. Never names/CID. */
export type TopbarStatus = {
  hn: string | null;
  /** the open panel window (its button shows as pressed), null = closed */
  panel: Panel | null;
  /** a newer agent version has been downloaded and can be installed (null = up to date) */
  update: string | null;
  /** HOSxP runs as Administrator but this agent does not: its saves cannot be seen (red warning badge) */
  blind: boolean;
  /** latest save check (of the saved patient, who may have left the screen): red blinking badge when data is missing; null = none */
  save: SaveCheck | null;
  /** RLU (Rational Lab Use) items in admin order; the badge blinks red when any item warns */
  rlu: { state: "loading" } | { state: "error" } | { state: "ok"; items: RluItem[] };
  /** RDU (Rational Drug Use) rules the latest visit's saved drugs/diagnoses hit: the "RDU" badge */
  rdu: { state: "loading" } | { state: "error" } | { state: "ok"; hits: RduHit[] };
  /** the patient's latest visit from /api/agent/authen: name, right (hipdata) and NHSO "ปิดสิทธิ" (close); null date = no visit */
  authen: { state: "loading" } | { state: "error" } | ({ state: "ok" } & Omit<AgentAuthenResponse, "hn">);
  /** opportunities (e.g. PP) the patient's latest visit matches: the "จัดเก็บ" badge */
  opps: { state: "loading" } | { state: "error" } | { state: "ok"; items: AlertOpportunity[] };
};
/** top bar renderer -> main */
export type TopbarCommand = { type: "collapse" } | { type: "expand" } | { type: "panel"; panel: Panel | null } | { type: "update" };
/** What the panel window shows. Sent main -> lab renderer. */
export type LabView = { hn: string | null; panel: Panel; save: SaveCheck | null; settings: ServicePoint; /** this agent's version, shown in the settings panel */ version?: string; rlu: TopbarStatus["rlu"]; rdu: TopbarStatus["rdu"]; /** the "warn" panel */ warning?: Warning; opps: TopbarStatus["opps"]; authen: TopbarStatus["authen"]; /** demo screenshots only: this RLU item starts expanded */ demoExpand?: string };
