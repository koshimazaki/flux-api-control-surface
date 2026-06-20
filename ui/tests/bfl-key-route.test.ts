import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "@/app/api/bfl/key/route";

describe("BFL key route local write guard", () => {
  it("rejects a write from another localhost origin before parsing the body", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3020/api/bfl/key", {
        method: "POST",
        headers: {
          origin: "http://localhost:9999",
          "content-type": "application/json"
        },
        body: JSON.stringify({ apiKey: "fake-key-that-must-not-be-written" })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Cross-origin requests are not allowed." });
  });

  it("rejects delete from another localhost origin before touching Keychain", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3020/api/bfl/key", {
        method: "DELETE",
        headers: { origin: "http://localhost:9999" }
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Cross-origin requests are not allowed." });
  });

  it("accepts same-origin requests through the local guard", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3020/api/bfl/key", {
        method: "POST",
        headers: {
          origin: "http://localhost:3020",
          "content-type": "application/json"
        },
        body: "not-json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Request body must be JSON" });
  });
});
