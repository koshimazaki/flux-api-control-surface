/**
 * Where a gallery asset can be sent, grouped the way BFL groups its products:
 * FLUX 3 (video and image), FLUX.2, and the FLUX Tools. A card shows one
 * family's buttons and opens the others on request, so the gallery is not a
 * wall of unlabelled icons.
 */
export type SendFamily = "flux3" | "flux2" | "tools";

export const SEND_FAMILIES: readonly SendFamily[] = ["flux3", "flux2", "tools"];
export const DEFAULT_SEND_FAMILY: SendFamily = "flux3";
export const SEND_FAMILY_KEY = "bfl-asset-send-family";

export const sendFamilyLabels: Record<SendFamily, { label: string; title: string }> = {
  flux3: { label: "FLUX 3", title: "FLUX 3 video and FLUX 3 Image" },
  flux2: { label: "FLUX.2", title: "FLUX.2 generation and its references" },
  tools: { label: "Tools", title: "FLUX Tools: erase, try-on, outpaint, deblur, glyphs, video edit and upscale" }
};

export type SendActionId =
  | "flux3-video-prompt"
  | "flux3-continue"
  | "flux3-keyframe"
  | "flux3-image-source"
  | "flux3-image-reference"
  | "flux3-image-box"
  | "flux2-prompt"
  | "flux2-reference"
  | "erase"
  | "vto-person"
  | "vto-garment"
  | "outpaint"
  | "deblur"
  | "glyphs"
  | "video-edit"
  | "video-upscale";

/** Buttons under one small caption; FLUX 3 splits into Video and Image. */
export type SendGroup = { caption?: string; actions: SendActionId[] };

const IMAGE_SENDS: Record<SendFamily, SendGroup[]> = {
  flux3: [
    { caption: "Video", actions: ["flux3-keyframe"] },
    { caption: "Image", actions: ["flux3-image-source", "flux3-image-reference", "flux3-image-box"] }
  ],
  flux2: [{ actions: ["flux2-prompt", "flux2-reference"] }],
  tools: [{ actions: ["erase", "vto-person", "vto-garment", "outpaint", "deblur", "glyphs"] }]
};

const VIDEO_SENDS: Record<SendFamily, SendGroup[]> = {
  flux3: [{ actions: ["flux3-video-prompt", "flux3-continue"] }],
  flux2: [],
  tools: [{ actions: ["video-edit", "video-upscale"] }]
};

export function isSendFamily(value: unknown): value is SendFamily {
  return SEND_FAMILIES.some((family) => family === value);
}

/**
 * The rows a card shows, the preferred family first: each family that has at
 * least one action this asset can take, with groups emptied by `can` left out.
 * A video has no FLUX.2 row, so a FLUX.2 preference falls back to FLUX 3 there.
 */
export function sendRowsFor(isVideo: boolean, preferred: SendFamily, can: (action: SendActionId) => boolean = () => true) {
  const sends = isVideo ? VIDEO_SENDS : IMAGE_SENDS;
  const rows = SEND_FAMILIES.map((family) => ({
    family,
    groups: sends[family]
      .map((group) => ({ ...group, actions: group.actions.filter(can) }))
      .filter((group) => group.actions.length > 0)
  })).filter((row) => row.groups.length > 0);
  const first = rows.find((row) => row.family === preferred) ?? rows[0];
  return first ? [first, ...rows.filter((row) => row !== first)] : [];
}

/** A card with this few send buttons shows every family on one line; more than that, and the rest fold away. */
export const SEND_INLINE_LIMIT = 4;

export function sendActionCount(rows: ReturnType<typeof sendRowsFor>) {
  return rows.reduce((count, row) => count + row.groups.reduce((sum, group) => sum + group.actions.length, 0), 0);
}
