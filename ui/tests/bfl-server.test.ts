import { describe, expect, it } from "vitest";
import { REDACTED_IMAGE_PLACEHOLDER, normalizeImageInput, redactImagePayload, resolveImageInput } from "@/lib/bfl-server";

// Regression for codex P2 on 9722528: BFL flux-tools want raw base64 or an
// HTTP(S) URL, not a data: URL. The dashboard produces data: URLs.
describe("normalizeImageInput", () => {
  it("strips the data:<mediatype>;base64, prefix to raw base64", () => {
    expect(normalizeImageInput("data:image/png;base64,iVBORw0KGgo")).toBe("iVBORw0KGgo");
    expect(normalizeImageInput("data:image/jpeg;base64,/9j/4AAQ")).toBe("/9j/4AAQ");
  });

  it("leaves HTTP(S) URLs untouched", () => {
    expect(normalizeImageInput("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(normalizeImageInput("http://localhost/x.jpg")).toBe("http://localhost/x.jpg");
  });

  it("leaves an already-raw base64 string untouched", () => {
    expect(normalizeImageInput("iVBORw0KGgoAAAANSUhEUg")).toBe("iVBORw0KGgoAAAANSUhEUg");
  });

  it("passes through empty / undefined unchanged", () => {
    expect(normalizeImageInput(undefined)).toBeUndefined();
    expect(normalizeImageInput("")).toBe("");
  });
});

// Regression: long JSON prompts exceed the size cutoff, so redaction used to
// collapse the stored prompt to "[image input omitted]". The prompt must survive
// while actual image inputs are still stripped.
describe("redactImagePayload", () => {
  const longPrompt = `{"scene":"${"a coherent hybrid specimen on a clean plane, ".repeat(80)}"}`;

  it("keeps the prompt even when it is far longer than the redaction cutoff", () => {
    expect(longPrompt.length).toBeGreaterThan(2048);
    const safe = redactImagePayload({ prompt: longPrompt, width: 1024 });
    expect(safe.prompt).toBe(longPrompt);
    expect(safe.width).toBe(1024);
  });

  it("still strips data: URLs and oversized base64 image inputs", () => {
    const safe = redactImagePayload({
      prompt: "tiny prompt",
      input_image: `data:image/png;base64,${"A".repeat(50)}`,
      input_image_2: "B".repeat(4096)
    });
    expect(safe.prompt).toBe("tiny prompt");
    expect(safe.input_image).toBe(REDACTED_IMAGE_PLACEHOLDER);
    expect(safe.input_image_2).toBe(REDACTED_IMAGE_PLACEHOLDER);
  });

  it("passes through short values and non-strings unchanged", () => {
    const safe = redactImagePayload({ output_format: "png", seed: 12345, disable_pup: true });
    expect(safe).toEqual({ output_format: "png", seed: 12345, disable_pup: true });
  });
});

// An app-relative outputs path is a pointer, not image data. When it cannot be
// turned into bytes (deleted output, or a browser-only asset whose stored
// descriptor still claims a local path), resolveImageInput used to return the
// path itself. Downstream, Buffer.from(path, "base64") decoded the path's
// base64-ish characters into a few garbage bytes, and the operator saw sharp's
// "Input buffer contains unsupported image format" — an error naming neither
// the reference nor the real cause.
describe("resolveImageInput", () => {
  const origin = "http://localhost:3017";

  it("refuses an unresolvable local outputs path instead of forwarding it as base64", async () => {
    await expect(resolveImageInput(`${origin}/api/outputs/missing-id/image`, origin)).rejects.toThrow(
      /no longer available locally/
    );
  });

  it("refuses the bare relative form too", async () => {
    await expect(resolveImageInput("/api/outputs/missing-id/image", origin)).rejects.toThrow(
      /no longer available locally/
    );
  });

  // The absolute form fails for the same reason rather than round-tripping: the
  // /api/outputs/[id]/image route resolves through the same fetchRemoteImage ->
  // findLocalOutputImage pair, so fetching it would be a guaranteed 404.
  it("does not let an unresolvable absolute form round-trip to a 404", async () => {
    await expect(resolveImageInput(`${origin}/api/outputs/missing-id/image`, origin)).rejects.toThrow(
      /no longer available locally/
    );
  });

  it("ignores an outputs URL from a different origin", async () => {
    expect(await resolveImageInput("https://elsewhere.test/api/outputs/x/image", origin)).toBe(
      "https://elsewhere.test/api/outputs/x/image"
    );
  });

  it("never hands the raw path onward as if it were image data", async () => {
    const path = "/api/outputs/missing-id/image";
    const resolved = await resolveImageInput(path, origin).catch(() => null);
    expect(resolved).not.toBe(path);
  });

  it("leaves genuine image inputs alone", async () => {
    expect(await resolveImageInput("data:image/png;base64,iVBORw0KGgo", origin)).toBe("iVBORw0KGgo");
    expect(await resolveImageInput("https://example.com/a.png", origin)).toBe("https://example.com/a.png");
    expect(await resolveImageInput("", origin)).toBe("");
    expect(await resolveImageInput(undefined, origin)).toBeUndefined();
  });
});
