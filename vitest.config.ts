import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // passWithNoTests: remove once the first Vitest suite lands (Task 5)
  test: { environment: "node", include: ["src/**/*.test.ts"], passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
