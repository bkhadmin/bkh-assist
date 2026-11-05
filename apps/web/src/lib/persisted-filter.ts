"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// จำ filter ของหน้าไว้ใน localStorage ของ browser นี้ จนกว่าจะล้างเองหรือออกจากระบบ
// ค่าจริงยังอยู่ใน URL (แชร์ link ได้) storage แค่เติมกลับตอนเข้าหน้าโดยไม่มี param เหล่านั้น
const PREFIX = "bkh:filter:";

function read(key: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function write(key: string, json: string) {
  try {
    if (json === "{}") localStorage.removeItem(key);
    else localStorage.setItem(key, json);
  } catch {
    // private window / storage ถูกปิด: ใช้ได้ต่อแบบไม่จำ
  }
}

/** เข้าหน้าโดยไม่มี param ใดใน `params` = เติมค่าที่จำไว้ลง URL (คง param อื่น) จากนั้นจำค่าใน URL ทุกครั้งที่เปลี่ยน
 *  ลบ param ออกจาก URL (ล้าง filter) = ลบค่าที่จำ ต้องอยู่ใต้ <Suspense> เพราะใช้ useSearchParams */
export function usePersistedFilter(key: string, params: readonly string[]): void {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const restored = useRef(false);
  const storageKey = PREFIX + key;
  const current = JSON.stringify(Object.fromEntries(params.flatMap((p) => (sp.get(p) ? [[p, sp.get(p)]] : []))));

  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const saved = current === "{}" ? read(storageKey) : null;
      const next = new URLSearchParams(sp.toString());
      for (const p of params) if (typeof saved?.[p] === "string" && saved[p]) next.set(p, saved[p]);
      if (next.toString() !== sp.toString()) {
        // effect รอบถัดไป (หลัง URL เปลี่ยน) จะเขียนค่าเดิมกลับลง storage
        router.replace(`${pathname}?${next}`, { scroll: false });
        return;
      }
    }
    write(storageKey, current);
  }, [current, storageKey, params, pathname, router, sp]);
}

/** ลบ filter ที่จำไว้ทุกหน้า (เรียกตอนออกจากระบบ ผู้ใช้คนถัดไปบนเครื่องเดียวกันจะได้ไม่เห็น filter เดิม) */
export function clearPersistedFilters(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // storage ใช้ไม่ได้ = ไม่มีอะไรให้ลบ
  }
}
