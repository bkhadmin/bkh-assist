import type { Module } from "../types";
import { Doctorcheck } from "./doctor-check";
import { MedRecordcheck } from "./med-record-check";
import { OPDVisitcheck } from "./opd-visit-check";

/** Module registry. Static TS for now; will move to the Assist DB later. */
const MODULES: ReadonlyMap<string, Module> = new Map([OPDVisitcheck, Doctorcheck, MedRecordcheck].map((m) => [m.code, m]));

export function getModule(code: string): Module | undefined {
  return MODULES.get(code);
}

export function listModules(): Module[] {
  return [...MODULES.values()];
}
