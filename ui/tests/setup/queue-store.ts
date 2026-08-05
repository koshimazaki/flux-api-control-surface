import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Every test file gets its own scratch queue store so route tests never write
// into the real outputs workspace and cannot see each other's jobs.
const dir = mkdtempSync(path.join(tmpdir(), "bfl-queue-test-"));
process.env.BFL_QUEUE_DIR = dir;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
