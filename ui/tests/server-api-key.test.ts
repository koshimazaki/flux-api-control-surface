import { afterEach, describe, expect, it } from "vitest";
import { resolveApiKeyWithSource } from "@/lib/server-api-key";

const originalBflKey = process.env.BFL_API_KEY;
const originalFluxKey = process.env.FLUX_API_KEY;

function resetEnv() {
  if (originalBflKey === undefined) delete process.env.BFL_API_KEY;
  else process.env.BFL_API_KEY = originalBflKey;
  if (originalFluxKey === undefined) delete process.env.FLUX_API_KEY;
  else process.env.FLUX_API_KEY = originalFluxKey;
}

describe("server API key resolution", () => {
  afterEach(resetEnv);

  it("uses an explicit request key only for that request", async () => {
    process.env.BFL_API_KEY = "env-bfl-key";
    const result = await resolveApiKeyWithSource("request-key");
    expect(result).toEqual({ apiKey: "request-key", source: "request" });
  });

  it("prefers BFL_API_KEY over FLUX_API_KEY", async () => {
    process.env.BFL_API_KEY = "env-bfl-key";
    process.env.FLUX_API_KEY = "env-flux-key";
    const result = await resolveApiKeyWithSource();
    expect(result).toEqual({ apiKey: "env-bfl-key", source: "env:BFL_API_KEY" });
  });

  it("falls back to FLUX_API_KEY when BFL_API_KEY is absent", async () => {
    delete process.env.BFL_API_KEY;
    process.env.FLUX_API_KEY = "env-flux-key";
    const result = await resolveApiKeyWithSource();
    expect(result).toEqual({ apiKey: "env-flux-key", source: "env:FLUX_API_KEY" });
  });
});
