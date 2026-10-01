import { clampValue, type Size } from "@/lib/canvas-geometry";

/**
 * FLUX 3 Image boxes. The API has no mask or box field: boxes are written into
 * the prompt. Each element is named `<id>` in the caption, and the prompt ends
 * with a JSON list of rows (docs.bfl.ai: FLUX 3 Image bounding boxes, layout
 * and editing pages, 1 October 2026):
 *
 * - layout rows (text to image): `{ id, bbox, desc }`
 * - edit rows: `{ id, from, src_bbox, tgt_bbox, desc }`, all five every time:
 *   new    from null,          src null,  tgt box   generate desc in the box
 *   keep   from "ref_image_0", src box,   tgt same  stays exactly where it is
 *   move   from "ref_image_0", src box,   tgt new   moves or resizes the element
 *   remove from "ref_image_0", src box,   tgt null  fills in what was behind
 *   pull   from "ref_image_N", src box in that image, tgt box in the output
 *
 * A box is `[top, left, bottom, right]` in integers on a 0–1000 grid: `tgt_bbox`
 * of the output, `src_bbox` of the image named in `from`. Edits send
 * `aspect_ratio: auto`, so the output keeps the source frame and a box drawn in
 * source pixels converts exactly. A pull sends the whole reference as its
 * source box, since boxes are not drawn on references yet. Boxes guide
 * placement; they are not clipping masks. The docs also ask the caption to say
 * where each element goes, so clauses carry position words.
 */
export type Flux3Box = { x: number; y: number; width: number; height: number };
/** What a box does: generate its desc ("change"), keep, move or remove what is there. */
export type Flux3BoxAction = "change" | "keep" | "move" | "remove";
export const FLUX3_BOX_ACTIONS: Flux3BoxAction[] = ["change", "keep", "move", "remove"];

/** One box on the source (edits) or on the layout frame (text to image), in that frame's pixels. */
export type Flux3ImageRegion = Flux3Box & {
  id: string;
  action: Flux3BoxAction;
  /** Move: where the element goes, in the same pixels. */
  target?: Flux3Box | null;
  /** The row's desc: the look after the edit (change), or what is there (keep, move, remove). */
  prompt: string;
  /** Change: take the element from this reference image (asset id) rather than generating it. */
  referenceId?: string | null;
};

/** A box as sent: its reference resolved to an image source. */
export type Flux3ImageRequestRegion = Omit<Flux3ImageRegion, "referenceId"> & { reference?: string };

export type GridBox = [number, number, number, number];
export type LayoutRow = { id: string; bbox: GridBox; desc: string };
export type EditRow = { id: string; from: string | null; src_bbox: GridBox | null; tgt_bbox: GridBox | null; desc: string };

/** Drawing threshold in frame pixels; anything smaller is a click, not a box. */
export const FLUX3_IMAGE_MIN_BOX = 8;
/**
 * Output area per resolution tier, nominally; BFL gives the exact size only
 * after submit, as `output_mp`.
 */
const NOMINAL_OUTPUT_PIXELS: Record<string, number> = { "768sq": 768 ** 2, "1k": 1024 ** 2, "2k": 2048 ** 2, "4k": 4096 ** 2 };
/** BFL: "a new element in a box of about 40 × 25 pixels often did not appear". */
const SMALL_NEW_ELEMENT_PIXELS = 40 * 25 * 1.5;
const WHOLE: GridBox = [0, 0, 1000, 1000];
const STOP_WORDS = new Set(
  "a an the and or of to in on at with into from for by it its this that make change turn replace add remove move keep put give be is are as so very".split(" ")
);

export const boxActionLabels: Record<Flux3BoxAction, string> = {
  change: "Change",
  keep: "Keep",
  move: "Move",
  remove: "Remove"
};

/** Pixels in a frame to BFL's `[top, left, bottom, right]` on 0–1000, each axis scaled on its own. */
export function toGrid(box: Flux3Box, frame: Size): GridBox {
  const scale = (value: number, total: number) => Math.round(clampValue((value / Math.max(1, total)) * 1000, 0, 1000));
  return [
    scale(box.y, frame.height),
    scale(box.x, frame.width),
    scale(box.y + box.height, frame.height),
    scale(box.x + box.width, frame.width)
  ];
}

/** Whether a new element's box comes out at about 40 × 25 output pixels or less at this resolution. */
export function isSmallBox(box: Flux3Box, frame: Size, resolution = "1k") {
  const share = (box.width * box.height) / Math.max(1, frame.width * frame.height);
  return share * (NOMINAL_OUTPUT_PIXELS[resolution] ?? NOMINAL_OUTPUT_PIXELS["1k"]) < SMALL_NEW_ELEMENT_PIXELS;
}

/** Where a grid box sits, in words: "at the top left", "on the right", "in the center". */
export function placeWords([top, left, bottom, right]: GridBox) {
  if (right - left >= 800 && bottom - top >= 800) return "across the whole frame";
  const third = (middle: number, low: string, high: string) => (middle < 333 ? low : middle > 667 ? high : "");
  const row = third((top + bottom) / 2, "top", "bottom");
  const column = third((left + right) / 2, "left", "right");
  if (row) return `at the ${[row, column].filter(Boolean).join(" ")}`;
  return column ? `on the ${column}` : "in the center";
}

/** Which way a move goes, in words: "up and to the left", or "to its marked place" for a resize. */
export function moveWords(from: GridBox, to: GridBox) {
  const dy = (to[0] + to[2] - from[0] - from[2]) / 2;
  const dx = (to[1] + to[3] - from[1] - from[3]) / 2;
  const vertical = Math.abs(dy) >= 50 ? (dy < 0 ? "up" : "down") : "";
  const horizontal = Math.abs(dx) >= 50 ? (dx < 0 ? "to the left" : "to the right") : "";
  return [vertical, horizontal].filter(Boolean).join(" and ") || "to its marked place";
}

/** Short, unique, lowercase ids from each box's words, numbered as BFL suggests: `red_scarf_1`, `area_2`. */
export function boxIds(regions: Pick<Flux3ImageRegion, "prompt">[]) {
  const counts = new Map<string, number>();
  return regions.map(({ prompt }) => {
    const words = prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !STOP_WORDS.has(word))
      .slice(0, 2);
    const base = words.join("_") || "area";
    const next = (counts.get(base) ?? 0) + 1;
    counts.set(base, next);
    return `${base}_${next}`;
  });
}

const sentence = (text: string) => text.trim().replace(/[.\s]+$/, "");
/** A change written as an instruction ("make the tiger pink") reads as is; a bare description gets "place". */
const INSTRUCTION = /^(make|change|turn|replace|swap|add|put|place|paint|recolou?r|give|fill|show|set|transform|convert|dress|cover|draw|insert|remove|erase|move|keep)\b/i;
/** Mid-sentence in the caption: "Make the tiger pink" reads "make the tiger pink". Acronyms keep their case. */
const clause = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/** The images an edit sends, in order: the source as `ref_image_0`, then each distinct box reference. */
export function editImages(source: string | undefined, regions: Flux3ImageRequestRegion[]) {
  const images = source ? [source] : [];
  for (const region of regions) {
    if (region.action === "change" && region.reference && !images.includes(region.reference)) images.push(region.reference);
  }
  return images;
}

/** Edit rows for the boxes, every field present, as the docs send them. */
export function editRows(regions: Flux3ImageRequestRegion[], frame: Size, images: string[]): EditRow[] {
  const ids = boxIds(regions);
  return regions.map((region, index) => {
    const box = toGrid(region, frame);
    const desc = sentence(region.prompt) || "the element in this area";
    const id = ids[index];
    if (region.action === "keep") return { id, from: "ref_image_0", src_bbox: box, tgt_bbox: box, desc };
    if (region.action === "remove") return { id, from: "ref_image_0", src_bbox: box, tgt_bbox: null, desc };
    if (region.action === "move") {
      return { id, from: "ref_image_0", src_bbox: box, tgt_bbox: toGrid(region.target ?? region, frame), desc };
    }
    const pulled = region.reference ? images.indexOf(region.reference) : -1;
    return pulled > 0
      ? { id, from: `ref_image_${pulled}`, src_bbox: WHOLE, tgt_bbox: box, desc }
      : { id, from: null, src_bbox: null, tgt_bbox: box, desc };
  });
}

/**
 * The caption an edit sends before its rows: the instruction, then each box
 * named as `<id>` with what happens to it, so the text and the table agree.
 */
export function composeEditPrompt(instruction: string | undefined, regions: Flux3ImageRequestRegion[], frame: Size, images: string[]) {
  const rows = editRows(regions, frame, images);
  const clauses: string[] = [];
  const kept: string[] = [];
  rows.forEach((row, index) => {
    const region = regions[index];
    const named = clause(sentence(region.prompt));
    const at = toGrid(region, frame);
    if (region.action === "keep") kept.push(`${named || "the marked area"} <${row.id}>`);
    else if (region.action === "remove") clauses.push(`remove ${named || "the marked element"} <${row.id}> ${placeWords(at)}`);
    else if (region.action === "move") {
      clauses.push(`move ${named || "the marked element"} <${row.id}> ${moveWords(at, toGrid(region.target ?? region, frame))}`);
    } else if (row.from && row.from !== "ref_image_0") {
      const image = Number(row.from.slice("ref_image_".length)) + 1;
      clauses.push(`add ${named || "the element"} <${row.id}> from image ${image} ${placeWords(at)}`);
    } else {
      const change = !named ? "change the marked area" : INSTRUCTION.test(named) ? named : `place ${named}`;
      clauses.push(`${change} <${row.id}> ${placeWords(at)}`);
    }
  });
  const parts = [
    sentence(instruction ?? "") ? `${sentence(instruction ?? "")}.` : "",
    clauses.length ? `In <ref_image_0>, ${clauses.join("; ")}.` : "",
    kept.length ? `Keep ${kept.join(", ")} exactly unchanged.` : "",
    "Keep the rest of the image exactly unchanged."
  ];
  return `${parts.filter(Boolean).join(" ")} ${JSON.stringify(rows)}`;
}

/** Layout rows for text to image, on the frame the boxes were drawn in. */
export function layoutRows(regions: Flux3ImageRequestRegion[], frame: Size): LayoutRow[] {
  const ids = boxIds(regions);
  return regions.map((region, index) => ({ id: ids[index], bbox: toGrid(region, frame), desc: sentence(region.prompt) }));
}

/** The caption first, naming any box it does not already mention, then the rows. */
export function composeLayoutPrompt(prompt: string | undefined, regions: Flux3ImageRequestRegion[], frame: Size) {
  const rows = layoutRows(regions, frame);
  const caption = sentence(prompt ?? "");
  const unnamed = rows.filter((row) => !caption.includes(`<${row.id}>`)).map((row) => `${row.desc} <${row.id}> ${placeWords(row.bbox)}`);
  const text = [caption ? `${caption}.` : "", unnamed.length ? `With ${unnamed.join(", ")}.` : ""].filter(Boolean).join(" ");
  return `${text} ${JSON.stringify(rows)}`;
}

/** What stops a set of boxes from being sent, or null. */
export function boxesBlocker(regions: Flux3ImageRequestRegion[], frame: Size | undefined, layout = false) {
  if (!regions.length) return layout ? null : "Draw a box on the image.";
  if (!frame?.width || !frame.height) return "Draw the boxes again; their image size is missing.";
  for (const [index, region] of regions.entries()) {
    const label = `box ${index + 1}`;
    if (layout || region.action === "change") {
      if (!region.prompt.trim() && !(region.reference && !layout)) return `Describe what goes in ${label}${layout ? "" : ", or give it a reference image"}.`;
    }
    if (!layout && region.action === "move" && !region.target) return `Drag where ${label} moves to.`;
  }
  return null;
}

function asBox(value: unknown): Flux3Box | null {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const numbers = [record.x, record.y, record.width, record.height].map(Number);
  if (numbers.some((entry) => !Number.isFinite(entry) || entry < 0)) return null;
  const [x, y, width, height] = numbers.map(Math.round);
  return { x, y, width, height };
}

/**
 * A stored box, read defensively. Regions saved when Precise drew lasso and
 * brush shapes keep their bounds as a box; their outlines and fuzz are dropped.
 */
export function normalizeBoxRegion(value: unknown): Flux3ImageRegion | null {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const box = asBox(record);
  if (typeof record.id !== "string" || !box || box.width < 1 || box.height < 1) return null;
  const action = FLUX3_BOX_ACTIONS.find((item) => item === record.action) ?? "change";
  const target = action === "move" ? asBox(record.target) : null;
  return {
    id: record.id,
    ...box,
    action,
    ...(target ? { target } : {}),
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    referenceId: typeof record.referenceId === "string" && record.referenceId ? record.referenceId : null
  };
}

/**
 * The text-to-image layout frame: 1000 pixels wide at the chosen aspect ratio
 * (`auto` is square, which is what the API makes without a reference).
 */
export function layoutFrameSize(aspectRatio: string): Size {
  const [width, height] = aspectRatio.split(":").map(Number);
  const ratio = width > 0 && height > 0 ? width / height : 1;
  return { width: 1000, height: Math.round(1000 / ratio) };
}

/** A plain frame with thirds, as an SVG image the canvas can draw boxes on. */
export function layoutFrameImage(size: Size) {
  const { width, height } = size;
  const lines = [1, 2]
    .map((step) => `<path d="M${(width * step) / 3} 0V${height}M0 ${(height * step) / 3}H${width}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#22262b"/><g stroke="#3a4048" stroke-width="2" stroke-dasharray="8 10">${lines}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Keeps layout boxes where they were, relative to the frame, when the aspect ratio changes. */
export function rescaleBoxes(regions: Flux3ImageRegion[], from: Size, to: Size): Flux3ImageRegion[] {
  if (from.width === to.width && from.height === to.height) return regions;
  const [sx, sy] = [to.width / from.width, to.height / from.height];
  const scale = (box: Flux3Box) => ({
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.max(1, Math.round(box.width * sx)),
    height: Math.max(1, Math.round(box.height * sy))
  });
  return regions.map((region) => ({ ...region, ...scale(region), ...(region.target ? { target: scale(region.target) } : {}) }));
}

/** Boxes from an untrusted request (an agent, MCP or the CLI): valid boxes only, with string references. */
export function normalizeRequestBoxes(value: unknown): Flux3ImageRequestRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const region = normalizeBoxRegion({ id: `box-${index + 1}`, ...record });
    if (!region) return [];
    const { referenceId: _referenceId, ...box } = region;
    return [{ ...box, ...(typeof record.reference === "string" && record.reference ? { reference: record.reference } : {}) }];
  });
}

/** A frame size from an untrusted request, or undefined. */
export function normalizeFrame(value: unknown): Size | undefined {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const [width, height] = [Number(record.width), Number(record.height)];
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;
}
