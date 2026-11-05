import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Monorepo: secrets live in the ROOT .env (F:\workspace\BKcontrol\.env), not apps/web/.env.
// Load it into process.env before Next reads anything. Values are read at request time by
// server code only (no NEXT_PUBLIC_ vars), so nothing is inlined into client bundles.
// forceReload=true: Next may already have run its own (empty) env load for apps/web.
const repoRoot = path.join(__dirname, "..", "..");
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", { info: () => {}, error: console.error }, true);

const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // @bkh/shared ships TypeScript source.
  transpilePackages: ["@bkh/shared"],
  // Native-ish Node driver: keep it out of the server bundle.
  serverExternalPackages: ["mysql2"],
  allowedDevOrigins,
  // Bottom-left is taken by the sidebar's profile block.
  devIndicators: { position: "bottom-right" },
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
