import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // loadEnv("", ...) reads .env + .env.local; prefix "" exposes all keys
    // (tests need server-only vars like DATABASE_URL, not just NEXT_PUBLIC_*)
    env: loadEnv("", process.cwd(), ""),
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
