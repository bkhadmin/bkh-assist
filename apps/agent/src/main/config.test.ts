// Run: node --test --experimental-strip-types apps/agent/src/main/config.test.ts
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

// The agent's sources import siblings without ".ts" (bundler style): map those for Node, as lab-tick.test.ts does.
type Next = (spec: string, ctx: unknown) => unknown;
(nodeModule as unknown as { registerHooks(h: { resolve(s: string, c: unknown, n: Next): unknown }): void }).registerHooks({
  resolve: (spec, ctx, next) => next(/^\.\.?\/[^.]*$/.test(spec) ? `${spec}.ts` : spec, ctx),
});
const { normalizeServerUrl } = await import("./config");

test("normalizeServerUrl accepts plain server addresses", () => {
  assert.equal(normalizeServerUrl("10.10.10.159:3020"), "http://10.10.10.159:3020");
  assert.equal(normalizeServerUrl(" http://10.10.10.159:3020/ "), "http://10.10.10.159:3020");
  assert.equal(normalizeServerUrl("https://assist.example.org/bkh/"), "https://assist.example.org/bkh");
  assert.equal(normalizeServerUrl("HTTP://Host:80"), "http://host");
});

test("normalizeServerUrl rejects anything else", () => {
  for (const bad of ["", "   ", "ftp://host", "file:///C:/x", "http://u:p@host", "http://host/?a=1", "http://host/#x", "http://"])
    assert.equal(normalizeServerUrl(bad), null, bad);
});
