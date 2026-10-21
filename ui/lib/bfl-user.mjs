import { z } from "zod";

/** Optional opaque end-user ID; official api.bfl.ai/openapi.json, 21 October 2026.
 * Count Unicode code points, as JSON Schema does, and preserve the value verbatim.
 */
export const bflUserSchema = z.string().min(1)
  .refine((value) => Array.from(value).length <= 256, "user must contain at most 256 characters.")
  .refine((value) => !value.includes("\0"), "user must not contain NUL characters.")
  .nullable().optional()
  .describe("Opaque end-user identifier: null or 1–256 Unicode characters, without NUL characters.");

export function bflUserBlocker(value) {
  const result = bflUserSchema.safeParse(value);
  return result.success ? null : "user must be null or a string of 1–256 characters without NUL characters.";
}

export function bflUserPayload(value) {
  const user = bflUserSchema.parse(value);
  return user === undefined ? {} : { user };
}
