import { beforeEach, describe, expect, it, vi } from "vitest";
import { bflUserPayload, bflUserSchema } from "@/lib/bfl-user.mjs";
import { buildFlux3ImagePayload } from "@/lib/flux3-image";
import { flux3ImageKleinSchema } from "@/lib/flux3-image-klein";
import { buildFlux3VideoPayload } from "@/lib/flux3-video";
import { buildVideoEditPayload } from "@/lib/video-edit";
import { buildVideoUpscalePayload } from "@/lib/video-upscale";
import { buildQueueJobDescriptor } from "@/lib/queue/descriptors";
import { bflModels, bflImageTools } from "@/lib/provider-registry";
import { operationAdapter, type OperationAdapter } from "@/lib/operations";

const mocks = vi.hoisted(() => ({ image: vi.fn(), video: vi.fn(), prepareImage: vi.fn() }));
vi.mock("@/lib/bfl-server", async (original) => ({
  ...await original<Record<string, unknown>>(),
  resolveImageInput: mocks.image
}));
vi.mock("@/lib/bfl-tool-inputs", () => ({
  prepareToolImageInput: mocks.prepareImage,
  prepareToolMaskInput: vi.fn(async () => ({ base64: "mask", coverage: 0.5 })),
  prepareVtoGarmentInput: vi.fn(async () => ({ base64: "garment", count: 1, composite: false }))
}));
vi.mock("@/lib/video-input-server", () => ({
  resolveVideoInput: mocks.video,
  downloadVideoBinary: vi.fn()
}));

const cases: Array<{ name: string; adapter: OperationAdapter; body: Record<string, unknown>; endpoint: string }> = [
  ...bflModels.map((model) => ({
    name: model.endpoint, adapter: operationAdapter("image"),
    body: { model: model.value, prompt: "fox" }, endpoint: model.endpoint
  })),
  ...bflImageTools.map((tool) => ({
    name: tool.endpoint, adapter: operationAdapter("tool"),
    body: { tool: tool.value, image: "source", mask: "mask", garment: "garment", prompt: "fox", canvasWidth: 1024, canvasHeight: 1024 },
    endpoint: tool.endpoint
  })),
  ...["flux-3-image", "flux-3-image-klein"].map((model) => ({
    name: model, adapter: operationAdapter("image"),
    body: { operation: "flux3-image", mode: "t2i", prompt: "fox", settings: { model } }, endpoint: model
  })),
  ...["t2v", "i2v", "v2v", "draft_enhance"].map((mode) => ({
    name: `flux-3-video:${mode}`, adapter: operationAdapter("video"),
    body: { mode, prompt: "fox", keyframes: ["image"], startVideo: "video", draftCache: "cache" }, endpoint: "flux-3-video"
  })),
  ...["video-edit", "video-upscale"].map((operation) => ({
    name: operation, adapter: operationAdapter("video"),
    body: { operation, inputVideo: "video", prompt: "fox" }, endpoint: `flux-tools/${operation}-v1`
  }))
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.image.mockImplementation(async (value) => value);
  mocks.video.mockResolvedValue({ buffer: Buffer.from("video"), contentType: "video/mp4" });
  mocks.prepareImage.mockResolvedValue({ base64: "source", width: 1024, height: 1024 });
});

describe("official optional BFL user contract", () => {
  it.each([null, "a", " ", "  opaque ID  ", "line\nfeed", "a".repeat(256), "😀".repeat(256)])(
    "preserves a valid identifier verbatim: %j", (user) => {
      expect(bflUserPayload(user)).toEqual({ user });
      expect(flux3ImageKleinSchema.parse({ prompt: "fox", user }).user).toBe(user);
    }
  );

  it("leaves omitted user absent with no injected default", () => {
    expect(bflUserPayload(undefined)).toEqual({});
    expect(flux3ImageKleinSchema.parse({ prompt: "fox" })).not.toHaveProperty("user");
  });

  it.each(["", "a".repeat(257), "😀".repeat(257), "\0", "before\0after", "end\0\n", 1, false, [], {}])(
    "rejects invalid types, lengths and NUL: %j", (user) => {
      expect(bflUserSchema.safeParse(user).success).toBe(false);
      expect(flux3ImageKleinSchema.safeParse({ prompt: "fox", user }).success).toBe(false);
    }
  );

  it("keeps rejecting unrelated Klein provider fields", () => {
    for (const extra of [{ user_id: "id" }, { grounding: true }, { unknown: true }]) {
      expect(flux3ImageKleinSchema.safeParse({ prompt: "fox", user: "id", ...extra }).success).toBe(false);
    }
  });

  it("includes user in the public payload builders, including draft enhancement", () => {
    const user = "opaque";
    const payloads = [
      buildFlux3ImagePayload({ mode: "t2i", prompt: "fox", user }).payload,
      buildFlux3ImagePayload({ mode: "t2i", prompt: "fox", user, settings: { model: "flux-3-image-klein" } }).payload,
      buildFlux3VideoPayload({ mode: "t2v", prompt: "fox", user }),
      buildFlux3VideoPayload({ mode: "draft_enhance", draftCache: "cache", user }),
      buildVideoEditPayload({ inputVideo: "video", prompt: "fox", user }),
      buildVideoUpscalePayload({ inputVideo: "video", user })
    ];
    for (const payload of payloads) expect(payload.user).toBe(user);
  });

  it.each(cases)("forwards string/null and omits missing user through $name", async ({ adapter, body, endpoint }) => {
    for (const user of [undefined, null, "  opaque ID  ", "😀".repeat(256)]) {
      const prepared = await adapter.prepare({ ...body, ...(user === undefined ? {} : { user }) });
      expect(prepared).not.toHaveProperty("error");
      if ("error" in prepared) throw new Error(prepared.error);
      expect(prepared.endpoint).toBe(endpoint);
      if (user === undefined) expect(prepared.payload).not.toHaveProperty("user");
      else expect(prepared.payload.user).toBe(user);
    }
  });

  it.each(cases)("rejects invalid user before resolving media through $name", async ({ adapter, body }) => {
    for (const user of ["", "a".repeat(257), "before\0after", 1, false, [], {}]) {
      expect(await adapter.prepare({ ...body, user })).toMatchObject({ status: 400, error: expect.stringContaining("user") });
    }
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
    expect(mocks.prepareImage).not.toHaveBeenCalled();
  });

  it("does not send user to the unconfirmed Klein finetuned contract", async () => {
    const prepared = await operationAdapter("image").prepare({ prompt: "fox", finetuneId: "test-finetune", user: "id" });
    expect(prepared).toMatchObject({ status: 400, error: expect.stringContaining("not documented") });
  });

  it("preserves opaque data-prefixed IDs and null through queue recovery", () => {
    for (const user of [null, "data:opaque", "😀".repeat(256)]) {
      const descriptor = buildQueueJobDescriptor({ jobId: "job", kind: "image", operation: "generate", body: { prompt: "fox", user } });
      expect(descriptor.body.user).toBe(user);
      expect(descriptor.recoverable).toBe(true);
    }
  });
});
