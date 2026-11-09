// Run: node --test --experimental-strip-types apps/agent/src/main/lab-tick.test.ts
// The agent's sources import siblings without ".ts" (bundler style): map those for Node before loading them.
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type Next = (spec: string, ctx: unknown) => unknown;
(nodeModule as unknown as { registerHooks(h: { resolve(s: string, c: unknown, n: Next): unknown }): void }).registerHooks({
  resolve: (spec, ctx, next) => next(/^\.\.?\/[^.]*$/.test(spec) ? `${spec}.ts` : spec, ctx),
});
const { cleanCaption, matchItem, shouldWarn } = await import("./lab-tick");
const { classifyCheckGlyph } = await import("./win32");

test("caption cleaning and matching", () => {
  assert.equal(cleanCaption("HbA1c ?"), "HbA1c");
  assert.equal(cleanCaption("  Creatinine?  "), "Creatinine");
  assert.equal(cleanCaption("HBsAg [ CLIA ]"), "HBsAg [ CLIA ]");
  const items = [
    { code: "HBA1C", label: "HbA1c", message: null, labNames: ["HbA1c"] },
    { code: "CU_HBSAG", label: "HBsAg", message: "x", labNames: ["HBsAg [ CLIA ]"] },
  ];
  assert.equal(matchItem(items, "HbA1c ?")?.code, "HBA1C");
  assert.equal(matchItem(items, "HBsAg [ CLIA ]")?.code, "CU_HBSAG");
  assert.equal(matchItem(items, "HbA1"), undefined); // exact names only, no substring
  assert.equal(matchItem(items, " ? "), undefined);
  assert.equal(shouldWarn(true), true);
  assert.equal(shouldWarn(null), true); // unreadable still warns
  assert.equal(shouldWarn(false), false);
});

// A 100x20 control: light background, a 10x10 glyph box with a dark border at (2,5), optionally a check mark.
function capture({ ticked, tint = 245, painted = true }: { ticked: boolean; tint?: number; painted?: boolean }) {
  const W = 100, H = 20, bits = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, v: number) => bits.set([v, v, v, 255], (y * W + x) * 4);
  if (!painted) return { bits, W, H };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 240);
  for (let y = 5; y <= 14; y++) for (let x = 2; x <= 11; x++) put(x, y, y === 5 || y === 14 || x === 2 || x === 11 ? 90 : tint);
  if (ticked) for (let i = 0; i < 6; i++) (put(4 + i, 7 + i, 30), put(5 + i, 7 + i, 30)); // a diagonal stroke
  return { bits, W, H };
}

test("pixel classifier", () => {
  const t = capture({ ticked: true }), u = capture({ ticked: false }), hover = capture({ ticked: false, tint: 200 });
  assert.equal(classifyCheckGlyph(t.bits, t.W, t.H), true);
  assert.equal(classifyCheckGlyph(u.bits, u.W, u.H), false);
  assert.equal(classifyCheckGlyph(hover.bits, hover.W, hover.H), false); // tinted on hover/press, still empty
  const blank = capture({ ticked: false, painted: false });
  assert.equal(classifyCheckGlyph(blank.bits, blank.W, blank.H), null); // nothing painted
});
