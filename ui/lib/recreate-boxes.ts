import { composeEditPrompt, composeLayoutPrompt, layoutFrameSize, type Flux3ImageRegion } from "@/lib/flux3-image-boxes";
import type { Flux3ImageDraft } from "@/lib/flux3-image-draft";
import type { ReferenceImage } from "@/lib/types";

/** Recover our older compiled box prompts only when rebuilding produces the exact same request. */
export function restoreCompiledBoxes(prompt: string, draft: Flux3ImageDraft, refs: ReferenceImage[]): boolean {
  const start = prompt.lastIndexOf('[{"id":');
  if (start < 0) return false;
  try {
    const rows = JSON.parse(prompt.slice(start));
    if (!Array.isArray(rows) || !rows.length || rows.length > 100) return false;
    const layout = draft.mode === "t2i";
    const frame = layout ? layoutFrameSize(draft.settings.aspectRatio) : draft.regionFrame;
    if (!frame) return false;
    const box = (value: unknown) => {
      if (!Array.isArray(value) || value.length !== 4 || !value.every((part) => typeof part === "number" && part >= 0 && part <= 1000) || value[2] <= value[0] || value[3] <= value[1]) throw new Error("Invalid box");
      return { x: value[1] * frame.width / 1000, y: value[0] * frame.height / 1000, width: (value[3] - value[1]) * frame.width / 1000, height: (value[2] - value[0]) * frame.height / 1000 };
    };
    const regions: Flux3ImageRegion[] = rows.map((row) => {
      if (typeof row.id !== "string" || typeof row.desc !== "string") throw new Error("Invalid row");
      if (layout) return { id: row.id, ...box(row.bbox), action: "change", prompt: row.desc, referenceId: null };
      if (row.from === "ref_image_0") {
        const same = JSON.stringify(row.src_bbox) === JSON.stringify(row.tgt_bbox);
        return { id: row.id, ...box(row.src_bbox), action: row.tgt_bbox === null ? "remove" : same ? "keep" : "move", prompt: row.desc,
          target: row.tgt_bbox === null || same ? null : box(row.tgt_bbox), referenceId: null };
      }
      const index = typeof row.from === "string" && /^ref_image_\d+$/.test(row.from) ? Number(row.from.slice(10)) : -1;
      if (row.from !== null && (index < 1 || !refs[index])) throw new Error("Missing box reference");
      return { id: row.id, ...box(row.tgt_bbox), action: "change", prompt: row.desc, referenceId: index >= 1 ? refs[index].assetId || refs[index].id : null };
    });
    const caption = prompt.slice(0, start).trim();
    let instruction: string;
    if (layout) instruction = caption.split(/(?:^| )With /)[0].replace(/\.$/, "");
    else instruction = caption.split(/(?:^| )In <ref_image_0>,|(?:^| )Keep /)[0].replace(/\.$/, "");
    const inputs = refs.map((ref) => ref.value);
    const requestRegions = regions.map(({ referenceId, ...region }) => ({ ...region, ...(referenceId ? { reference: refs.find((ref) => (ref.assetId || ref.id) === referenceId)?.value } : {}) }));
    const rebuilt = layout ? composeLayoutPrompt(instruction, requestRegions, frame) : composeEditPrompt(instruction, requestRegions, frame, inputs);
    if (rebuilt.trim() !== prompt.trim()) return false;
    if (layout) { draft.layoutEnabled = true; draft.layoutRegions = regions; draft.prompts.t2i = instruction; }
    else { draft.regions = regions; draft.prompts.precise = instruction; }
    return true;
  } catch { return false; }
}
