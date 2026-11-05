/** What the alert window shows. Sent main -> renderer over IPC. Never contains names/CID. */
export type AlertItem = { label: string; severity: "error" | "warning" };

export type AlertState =
  | { kind: "checking"; hn: string | null; module: string }
  | { kind: "ok"; hn: string | null; module: string }
  | { kind: "missing"; hn: string | null; module: string; items: AlertItem[] }
  | { kind: "ambiguous"; hn: string | null; module: string; count: number }
  | { kind: "error"; message: string };

/** renderer -> main */
export type AlertCommand =
  | { type: "dismiss" }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "resize"; width: number; height: number };
