import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { queueDir, runnerLeasePath } from "./paths";
import { serializeQueueWrite } from "./store";
import { withStoreLock } from "./store-lock";
import type { RunnerLease } from "./types";

export const RUNNER_LEASE_TTL_MS = 30_000;

export function createRunnerOwnerToken() {
  return `${process.pid}-${randomUUID().slice(0, 8)}`;
}

function normalizeLease(value: unknown): RunnerLease | null {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<RunnerLease>;
  if (typeof raw.owner !== "string" || !raw.owner) return null;
  return {
    owner: raw.owner,
    acquiredAt: typeof raw.acquiredAt === "number" ? raw.acquiredAt : 0,
    renewedAt: typeof raw.renewedAt === "number" ? raw.renewedAt : 0,
    expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : 0
  };
}

export async function readRunnerLease(): Promise<RunnerLease | null> {
  try {
    return normalizeLease(JSON.parse(await readFile(runnerLeasePath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    return null;
  }
}

async function writeRunnerLease(lease: RunnerLease) {
  await mkdir(queueDir(), { recursive: true });
  const target = runnerLeasePath();
  const temp = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temp, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export type LeaseOutcome = {
  held: boolean;
  lease: RunnerLease | null;
  tookOver: boolean;
};

/**
 * Acquire or renew the single-runner lease. A lease is only taken from another
 * owner once it has expired. Read and write happen under the cross-process store
 * lock, so two servers racing the same expiry cannot both win — the earlier
 * write-then-reread check alone still admitted two winners under interleaving.
 */
export function acquireRunnerLease(owner: string, now = Date.now(), ttlMs = RUNNER_LEASE_TTL_MS) {
  return serializeQueueWrite<LeaseOutcome>(() =>
    withStoreLock(async () => {
      const current = await readRunnerLease();
      const mine = current?.owner === owner;
      const expired = !current || current.expiresAt <= now;
      if (!mine && !expired) return { held: false, lease: current, tookOver: false };

      const lease: RunnerLease = {
        owner,
        acquiredAt: mine && current ? current.acquiredAt : now,
        renewedAt: now,
        expiresAt: now + ttlMs
      };
      await writeRunnerLease(lease);
      const confirmed = await readRunnerLease();
      if (confirmed?.owner !== owner) return { held: false, lease: confirmed, tookOver: false };
      return { held: true, lease: confirmed, tookOver: !mine && Boolean(current) };
    })
  );
}

export function releaseRunnerLease(owner: string) {
  return serializeQueueWrite(() =>
    withStoreLock(async () => {
      const current = await readRunnerLease();
      if (!current || current.owner !== owner) return false;
      await writeRunnerLease({ ...current, expiresAt: 0 });
      return true;
    })
  );
}

export function leaseIsHeldBy(lease: RunnerLease | null, owner: string, now = Date.now()) {
  return Boolean(lease && lease.owner === owner && lease.expiresAt > now);
}
