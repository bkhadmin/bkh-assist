/** What the alert window shows. Sent main -> renderer over IPC. Never contains names/CID. */
export type AlertItem = { label: string; severity: "error" | "warning" };
/** Add-on service hint (patient qualifies for a billable service). Not missing data. */
export type AlertOpportunity = { category: string; label: string };

export type AlertState =
  | { kind: "checking"; hn: string | null; module: string }
  | { kind: "ok"; hn: string | null; module: string; opportunities: AlertOpportunity[] }
  | { kind: "missing"; hn: string | null; module: string; items: AlertItem[]; opportunities: AlertOpportunity[] }
  | { kind: "ambiguous"; hn: string | null; module: string; count: number }
  | { kind: "error"; message: string };

/** What the top bar shows: the HN HOSxP displays right now (null = none) and its HbA1c. Never names/CID. */
export type TopbarStatus = {
  hn: string | null;
  /** the HbA1c window is open (the button shows as pressed) */
  labOpen: boolean;
  /** a newer agent version has been downloaded and can be installed (null = up to date) */
  update: string | null;
  /** last 3 results, newest first ("YYYY-MM-DD", value as reported) */
  hba1c: { state: "loading" } | { state: "error" } | { state: "ok"; results: { date: string; value: string }[] };
};
/** top bar renderer -> main */
export type TopbarCommand = { type: "collapse" } | { type: "expand" } | { type: "lab"; open: boolean } | { type: "update" };
/** What the HbA1c window shows. Sent main -> lab renderer. */
export type LabView = { hn: string; hba1c: TopbarStatus["hba1c"] };

/** renderer -> main */
export type AlertCommand =
  | { type: "dismiss" }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "resize"; width: number; height: number };
