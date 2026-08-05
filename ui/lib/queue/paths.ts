import path from "node:path";
import { OUTPUT_ROOT } from "@/lib/server-output-store";

/**
 * The queue store lives beside the other dashboard sidecars under the output
 * workspace. BFL_QUEUE_DIR exists so tests and throwaway dev servers can point
 * the store at a scratch directory instead of the real gallery workspace.
 */
export function queueDir() {
  const override = process.env.BFL_QUEUE_DIR?.trim();
  return override ? path.resolve(override) : path.join(OUTPUT_ROOT, ".generation-queue");
}

export function queueStorePath() {
  return path.join(queueDir(), "queue.json");
}

export function runnerLeasePath() {
  return path.join(queueDir(), "runner-lease.json");
}
