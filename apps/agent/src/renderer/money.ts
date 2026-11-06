import type { AlertOpportunity } from "../shared/alert-state";

/** "฿1,250" */
export const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** Sum of the priced items (items without an icode in admin have no price). */
export const priceSum = (items: AlertOpportunity[]) => items.reduce((s, o) => s + (o.price ?? 0), 0);
