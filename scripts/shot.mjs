// Screenshot pages of the running web app, signed in as the super user from .env.
//   npm run shot -- /admin/modules /admin/machines
//   npm run shot -- --out=tmp/shots --width=1280 --dark /
// Options: --base=http://localhost:3000  --out=<dir> (default: tmp/shots)  --width/--height  --dark  --full (full page)
// Credentials are read from AUTH_ADMIN_USER / AUTH_ADMIN_PASSWORD and never printed.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? def;
const flag = (name) => args.includes(`--${name}`);
const paths = args.filter((a) => !a.startsWith("--"));
if (!paths.length) paths.push("/");

const base = opt("base", "http://localhost:3000").replace(/\/+$/, "");
const out = opt("out", join("tmp", "shots"));
const user = process.env.AUTH_ADMIN_USER;
const password = process.env.AUTH_ADMIN_PASSWORD;
if (!user || !password) {
  console.error("Missing env: AUTH_ADMIN_USER / AUTH_ADMIN_PASSWORD (run via npm run shot, which loads .env)");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(opt("width", 1440)), height: Number(opt("height", 900)) },
    colorScheme: flag("dark") ? "dark" : "light",
    locale: "th-TH",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${base}/super/login`);
  await page.getByLabel("ชื่อผู้ใช้").fill(user);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/super/login")), page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()]);

  for (const [i, p] of paths.entries()) {
    const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
    const file = join(out, `${String(i + 1).padStart(2, "0")}-${p.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "home"}.png`);
    await page.screenshot({ path: file, fullPage: flag("full") });
    console.log(`${res?.status() ?? "?"} ${p} -> ${file}`);
  }
  if (errors.length) console.log(`\nbrowser errors:\n${errors.map((e) => `  ${e}`).join("\n")}`);
} finally {
  await browser.close();
}
