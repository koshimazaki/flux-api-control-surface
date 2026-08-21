import type { Flux3VideoMode } from "@/lib/flux3-video";
import type {
  VideoScriptRateMode,
  VideoScriptRateTable,
  VideoScriptRateTier,
  VideoScriptSettings
} from "./types";

/**
 * BFL FLUX 3 preview pricing as of 2026-08-05: $0.06/s for t2v/i2v drafts,
 * $0.17/s HD, $0.29/s FHD; video continuation is $0.12/s draft, $0.43/s HD,
 * $0.54/s FHD.
 *
 * This is the single rates constant for the planner. It is data rather than
 * inline arithmetic so the reconciliation pass against BFL's returned `cost` can
 * swap in observed rates (per mode and tier) without touching planner logic —
 * every estimator here takes an optional table argument.
 */
export const FLUX3_VIDEO_RATES: VideoScriptRateTable = {
  source: "BFL FLUX 3 preview pricing",
  capturedAt: "2026-08-05",
  currency: "USD",
  perSecond: {
    t2v: { draft: 0.06, hd: 0.17, fhd: 0.29 },
    i2v: { draft: 0.06, hd: 0.17, fhd: 0.29 },
    v2v: { draft: 0.12, hd: 0.43, fhd: 0.54 }
  }
};

/** Drafts always render in the hd class, so `draft` wins over the resolution. */
export function videoRateTier(settings: Pick<VideoScriptSettings, "draft" | "resolution">): VideoScriptRateTier {
  if (settings.draft) return "draft";
  return settings.resolution === "fhd" ? "fhd" : "hd";
}

/** Draft enhancement is priced by BFL at submit time, so it has no local rate. */
export function videoRateMode(mode: Flux3VideoMode): VideoScriptRateMode | null {
  return mode === "draft_enhance" ? null : mode;
}

/**
 * Per-row estimate in USD. Returns null when the duration is "auto", because the
 * billed length is only known once BFL accepts the request.
 */
export function estimateVideoUsd(
  input: { mode: Flux3VideoMode } & Pick<VideoScriptSettings, "duration" | "draft" | "resolution">,
  rates: VideoScriptRateTable = FLUX3_VIDEO_RATES
): number | null {
  const mode = videoRateMode(input.mode);
  if (!mode) return null;
  if (typeof input.duration !== "number" || !Number.isFinite(input.duration)) return null;
  const rate = rates.perSecond[mode]?.[videoRateTier(input)];
  if (typeof rate !== "number") return null;
  return roundUsd(input.duration * rate);
}

/** Trims binary floating point noise so totals compare cleanly in the UI. */
export function roundUsd(value: number) {
  return Math.round(value * 1e6) / 1e6;
}
