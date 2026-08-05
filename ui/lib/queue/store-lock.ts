import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { queueDir } from "./paths";

export const STORE_LOCK_STALE_MS = 15_000;
const ACQUIRE_TIMEOUT_MS = 10_000;
const RETRY_MS = 15;

function lockPath() {
  return path.join(queueDir(), "queue.lock");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lockAgeMs() {
  try {
    const raw = JSON.parse(await readFile(lockPath(), "utf8"));
    const at = typeof raw?.at === "number" ? raw.at : 0;
    return Date.now() - at;
  } catch {
    // Unreadable or already-released lock: treat as stale so a crashed holder
    // cannot wedge the queue forever.
    return Number.POSITIVE_INFINITY;
  }
}

async function tryAcquire() {
  // "wx" fails when the file exists, which is the atomic create-if-absent the
  // cross-process mutex needs. mkdir/rename are not enough on their own because
  // two processes can both win a read-then-write race. Create and write in one
  // call so a competitor can never observe an empty lock file and classify a
  // just-acquired lock as stale.
  await writeFile(lockPath(), JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
  return true;
}

async function release() {
  await rm(lockPath(), { force: true });
}

/**
 * Cross-process mutual exclusion around a queue read-modify-write. In-process
 * serialization alone cannot stop a second dev server (or an MCP-driven process)
 * from interleaving with this one, and an interleaved write can resurrect a
 * settled job or lose a submitted request id.
 */
export async function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  await mkdir(queueDir(), { recursive: true });
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  let held = false;
  while (!held) {
    try {
      held = await tryAcquire();
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
      if ((await lockAgeMs()) > STORE_LOCK_STALE_MS) {
        await release();
        continue;
      }
      if (Date.now() > deadline) {
        // Never block a request forever: proceed unlocked rather than hang. The
        // in-process serializer and the revision check still apply.
        return task();
      }
      await sleep(RETRY_MS);
    }
  }
  try {
    return await task();
  } finally {
    await release();
  }
}
