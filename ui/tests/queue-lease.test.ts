import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
  RUNNER_LEASE_TTL_MS,
  acquireRunnerLease,
  createRunnerOwnerToken,
  leaseIsHeldBy,
  readRunnerLease,
  releaseRunnerLease
} from "@/lib/queue/lease";
import { queueDir } from "@/lib/queue/paths";

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
});

describe("runner lease", () => {
  it("gives exactly one owner the right to advance jobs", async () => {
    const first = createRunnerOwnerToken();
    const second = createRunnerOwnerToken();
    const now = 1_000_000;

    const a = await acquireRunnerLease(first, now);
    const b = await acquireRunnerLease(second, now);

    expect(a.held).toBe(true);
    expect(b.held).toBe(false);
    expect((await readRunnerLease())?.owner).toBe(first);
  });

  it("lets the holder renew without changing owner", async () => {
    const owner = createRunnerOwnerToken();
    const first = await acquireRunnerLease(owner, 1_000);
    const renewed = await acquireRunnerLease(owner, 5_000);
    expect(renewed.held).toBe(true);
    expect(renewed.tookOver).toBe(false);
    expect(renewed.lease?.acquiredAt).toBe(first.lease?.acquiredAt);
    expect(renewed.lease?.expiresAt).toBe(5_000 + RUNNER_LEASE_TTL_MS);
  });

  it("allows a new process to take over only after the lease expires", async () => {
    const dead = createRunnerOwnerToken();
    const fresh = createRunnerOwnerToken();
    await acquireRunnerLease(dead, 1_000);

    const tooEarly = await acquireRunnerLease(fresh, 1_000 + RUNNER_LEASE_TTL_MS - 1);
    expect(tooEarly.held).toBe(false);

    const takeover = await acquireRunnerLease(fresh, 1_000 + RUNNER_LEASE_TTL_MS + 1);
    expect(takeover.held).toBe(true);
    expect(takeover.tookOver).toBe(true);
    expect(leaseIsHeldBy(takeover.lease, fresh, 1_000 + RUNNER_LEASE_TTL_MS + 2)).toBe(true);
    expect(leaseIsHeldBy(takeover.lease, dead, 1_000 + RUNNER_LEASE_TTL_MS + 2)).toBe(false);
  });

  it("releases the lease so a restarted server can pick it up immediately", async () => {
    const owner = createRunnerOwnerToken();
    const other = createRunnerOwnerToken();
    await acquireRunnerLease(owner, 1_000);
    expect(await releaseRunnerLease(other)).toBe(false);
    expect(await releaseRunnerLease(owner)).toBe(true);
    expect((await acquireRunnerLease(other, 1_001)).held).toBe(true);
  });
});
