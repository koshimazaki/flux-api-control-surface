import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next; tests compile it themselves so components can be imported.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Points the file-backed generation queue at a scratch directory so the
    // suite never mutates the real outputs workspace.
    setupFiles: ["tests/setup/queue-store.ts"]
  }
});
