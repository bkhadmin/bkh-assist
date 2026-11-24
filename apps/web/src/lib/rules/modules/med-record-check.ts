import type { Module } from "../types";
import { uptZ32Rule } from "./upt-z32";

/**
 * MedRecordcheck — งานเวชระเบียน: coding checks for medical records staff on HOSxP's visit list
 * (TPatientOPDVisitListForm). Coding a past visit there updates ovstdiag, which resolve-visit also looks at.
 */
export const MedRecordcheck: Module = {
  code: "MedRecordcheck",
  label: "งานเวชระเบียน",
  rules: [uptZ32Rule("MedRecordcheck")],
};
