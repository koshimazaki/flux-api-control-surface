import { z } from "zod";
import { bflUserSchema } from "@/lib/bfl-user.mjs";

export const FLUX3_IMAGE_KLEIN_MODEL = "flux-3-image-klein";
export const FLUX3_IMAGE_ASPECT_RATIOS = [
  "auto", "21:9", "2:1", "16:9", "3:2", "7:5", "4:3", "5:4", "1:1",
  "4:5", "3:4", "5:7", "2:3", "9:16", "1:2", "9:21"
] as const;
export const FLUX3_IMAGE_KLEIN_RESOLUTIONS = ["768sq", "1k", "1.5k", "2k", "4k"] as const;

/** Official https://api.bfl.ai/openapi.json, verified 15 October 2026.
 * Dimensions and image-count limits are also specified in field descriptions.
 * Omitted/null resolution preserves the first reference's size for editing.
 */
export const flux3ImageKleinSchema = z.strictObject({
  prompt: z.string(),
  user: bflUserSchema,
  images: z.union([z.string(), z.array(z.string()).min(1).max(10)]).nullable().optional(),
  aspect_ratio: z.enum(FLUX3_IMAGE_ASPECT_RATIOS).default("auto"),
  resolution: z.enum(FLUX3_IMAGE_KLEIN_RESOLUTIONS).nullable().optional(),
  width: z.number().int().min(64).max(6256).nullable().optional(),
  height: z.number().int().min(64).max(6256).nullable().optional(),
  seed: z.number().int().min(0).max(4294967295).nullable().optional(),
  safety_tolerance: z.number().int().min(0).max(7).default(2),
  output_format: z.enum(["jpeg", "png"]).default("jpeg"),
  // The docs describe 16 steps when omitted; leave it to the provider.
  steps: z.number().int().min(1).max(16).nullable().optional()
}).superRefine((value, context) => {
  if ((value.width != null) !== (value.height != null)) {
    context.addIssue({ code: "custom", path: ["width"], message: "Set width and height together." });
  }
  if (value.width != null && value.height != null && value.width * value.height > 16822272) {
    context.addIssue({ code: "custom", path: ["width"], message: "width × height must be at most 16822272 pixels." });
  }
});

const settingNames: Record<string, string> = {
  aspectRatio: "aspect_ratio", safetyTolerance: "safety_tolerance", outputFormat: "output_format"
};

/** Translate only known wrapper names; unknown fields survive so strict validation rejects them. */
export function kleinSettingsPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "model")
    .map(([key, entry]) => [settingNames[key] ?? key, entry]));
}

export function kleinSettingsBlocker(value: unknown) {
  if (value != null && (typeof value !== "object" || Array.isArray(value))) return "Klein settings must be an object.";
  const allowed = ["model", "aspectRatio", "resolution", "width", "height", "seed", "safetyTolerance", "outputFormat", "steps"];
  const extra = Object.keys(value ?? {}).filter((key) => !allowed.includes(key));
  if (extra.length) return `Unsupported Klein settings: ${extra.join(", ")}.`;
  const parsed = flux3ImageKleinSchema.safeParse({ prompt: "", ...kleinSettingsPayload(value) });
  return parsed.success ? null : `FLUX 3 Image Klein settings: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
}
