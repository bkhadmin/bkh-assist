# bkh_assist

ตัวช่วยตรวจความครบถ้วนของการบันทึก HOSxP XE: agent บน Windows เห็นผู้ใช้กด "บันทึก" แล้วส่ง HN และเวลาที่บันทึกมาที่เซิร์ฟเวอร์นี้ เซิร์ฟเวอร์หา visit (VN) ในฐาน HOSxP แล้วรันกฎตรวจของ module ที่เปิดใช้บนเครื่องนั้น จากนั้นตอบกลับว่าช่องที่ต้องกรอกช่องไหนยังขาด

## โครงสร้าง

| Path | เนื้อหา |
| --- | --- |
| `apps/web` | เซิร์ฟเวอร์ Next.js (App Router) มี API สำหรับ agent |
| `apps/agent` | agent บน Windows (Electron) |
| `packages/shared` | `@bkh/shared`: zod schema และ type ของ API ระหว่าง agent กับเซิร์ฟเวอร์ (ส่งออกเป็น TS source) |

## ตั้งค่า

1. `cp .env.example .env` แล้วกรอกค่า โดยมีไฟล์ `.env` **ไฟล์เดียวที่ root** และ `apps/web/next.config.ts` จะโหลดไฟล์นี้ด้วย `@next/env`
   - `HIS_*`: HOSxP MariaDB/MySQL ให้ใช้ user ที่มีสิทธิ์ **SELECT อย่างเดียว**
   - `AGENT_ENROLL_KEY`: ถ้าว่าง ทุก request ของ agent จะได้ 401
   - `ASSIST_*` (PostgreSQL): ยังไม่ได้ต่อ
   - ตัวแปรที่ตั้งไว้ใน environment ของ process แล้วจะชนะค่าใน `.env`
2. `npm install` ที่ root (ใช้ npm workspaces)

## คำสั่ง (รันที่ root)

```sh
npm run dev        # next dev (apps/web)
npm run build      # typecheck shared + next build
npm run start      # next start
npm run lint
npm run typecheck  # tsc ของ shared + next typegen && tsc ของ web
```

## API

### `GET /api/health`
รัน `SELECT 1` กับ HIS แล้วตอบ `200 {"status":"ok","his":"ok","latencyMs":..}` ถ้าต่อไม่ได้ตอบ `503 {"status":"error","his":"error","code":"..."}`

### `POST /api/agent/check`
Header `x-agent-key: <AGENT_ENROLL_KEY>` (เปรียบเทียบแบบ timing-safe) ถ้าไม่ตรงจะได้ `401`

Body (`CheckRequest`):
```json
{ "machine": "OPD-PC01", "module": "OPDVisitcheck", "hn": "0001234", "savedAt": "2026-11-05T09:15:00+07:00" }
```
`vn` ไม่บังคับ ส่วน `savedAt` ต้องเป็น ISO 8601 ที่มี offset หรือ `Z`

ลำดับการหา visit: ถ้ามี `vn` ใช้ `vn` ก่อน ถ้าไม่มีแต่มี `hn` จะหา visit ของ HN นั้นที่อัปเดตในช่วง savedAt −10 นาที ถึง +2 นาที ถ้าไม่มีทั้งคู่จะหาจากเวลาอย่างเดียวในช่วง −60 วินาที ถึง +30 วินาที เวลาจะแปลงเป็นเวลาท้องถิ่นของ HIS (UTC+7)

Response (`CheckResponse`):
- `ok`: ทุกกฎผ่าน
- `missing`: มีอย่างน้อยหนึ่งกฎไม่ผ่าน (ดู `results[].severity` ซึ่งเป็น `error` หรือ `warning`)
- `ambiguous`: เจอหลาย visit ส่งกลับใน `candidates` (สูงสุด 10 รายการ)
- `not_found`: ไม่เจอ visit

Error: `400 invalid_json | invalid_body | unknown_module`, `401 unauthorized`, `502 his_unavailable`

Log บันทึกแค่ vn, module และ status ไม่บันทึก HN ชื่อ หรือ CID

## กฎตรวจ (rules)

- type อยู่ที่ `apps/web/src/lib/rules/types.ts`
- module อยู่ที่ `apps/web/src/lib/rules/modules/*.ts` และต้องลงทะเบียนใน `modules/index.ts`
- SQL ของแต่ละกฎต้องเป็น SELECT เดียวที่รับ `?` ตัวเดียว (คือ vn) และคืนหนึ่งแถวที่มีคอลัมน์ `ok` เป็น 1 หรือ 0 ถ้าไม่มีแถวกลับมาจะนับว่าไม่ผ่าน
- `hisQuery` (`apps/web/src/lib/his.ts`) ยอมรับเฉพาะ statement เดียวที่ขึ้นต้นด้วย SELECT/WITH ใช้ placeholder `?` เท่านั้น (จำนวนต้องเท่ากับ params) ห้าม block comment และห้ามคำสั่งเขียนหรือล็อก ค่าทุกตัวส่งเป็น parameter ของ prepared statement และ session ถูกตั้งเป็น READ ONLY

SQL ที่ยังเป็น placeholder มี comment `// TODO: proven SQL from prove-query` กำกับไว้
