import { describe, expect, it } from "vitest";
import { addAsNextBoxReference, addAsNextReference, openAsEditSource } from "@/lib/dashboard/flux3-image-inbox";
import { defaultFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import type { Flux3ImageRegion } from "@/lib/flux3-image-boxes";

const box = (id: string, patch: Partial<Flux3ImageRegion> = {}): Flux3ImageRegion => ({
  id,
  x: 10,
  y: 10,
  width: 100,
  height: 100,
  action: "change",
  prompt: "",
  referenceId: null,
  ...patch
});
const draft = (patch: Partial<Flux3ImageDraft> = {}): Flux3ImageDraft => ({ ...defaultFlux3ImageDraft, ...patch });

describe("gallery buttons for FLUX 3 Image", () => {
  it("open an image as the edit source, keeping boxes already drawn on that same image", () => {
    const fresh = openAsEditSource(draft({ mode: "t2i" }), "fox", "fox");
    expect(fresh).toMatchObject({ added: true, message: "Loaded fox as the FLUX 3 Image edit source." });
    expect(fresh.draft.mode).toBe("edit");

    const boxed = draft({ mode: "i2i", regionSourceId: "fox", regions: [box("a")] });
    expect(openAsEditSource(boxed, "fox", "fox").draft.mode).toBe("precise");
    // Boxes drawn on another image do not carry over, so that one opens as a plain edit.
    expect(openAsEditSource(boxed, "hat", "hat").draft.mode).toBe("edit");
  });

  it("fill reference slots one after another and open Image mode", () => {
    let current = draft({ mode: "precise" });
    const labels: string[] = [];
    for (const id of ["fox", "hat", "coat"]) {
      const result = addAsNextReference(current, id, id);
      current = result.draft;
      labels.push(result.message);
    }
    expect(current.mode).toBe("i2i");
    expect(current.references.slice(0, 4)).toEqual(["fox", "hat", "coat", null]);
    expect(labels[2]).toBe("Added coat as FLUX 3 Image reference 3.");
  });

  it("say where an image already is, and when every slot is taken", () => {
    const withFox = addAsNextReference(draft(), "fox", "fox").draft;
    expect(addAsNextReference(withFox, "fox", "fox")).toMatchObject({ added: false, message: "fox is already FLUX 3 Image reference 1." });
    const full = draft({ references: Array.from({ length: 10 }, (_, index) => `asset-${index}`) });
    expect(addAsNextReference(full, "new", "new")).toMatchObject({ added: false, message: expect.stringMatching(/All ten/) });
  });

  it("give the next Change box without a reference the image, skipping other boxes", () => {
    const start = draft({
      mode: "edit",
      regions: [box("a", { referenceId: "lamp" }), box("b", { action: "keep" }), box("c"), box("d")]
    });
    const first = addAsNextBoxReference(start, "fox", "fox");
    expect(first).toMatchObject({ added: true, message: "Added fox as the reference for box 3." });
    expect(first.draft.mode).toBe("precise");
    const second = addAsNextBoxReference(first.draft, "hat", "hat");
    expect(second.draft.regions.map((region) => region.referenceId)).toEqual(["lamp", null, "fox", "hat"]);
    expect(addAsNextBoxReference(second.draft, "coat", "coat")).toMatchObject({ added: false, message: expect.stringMatching(/Every Change box/) });
  });

  it("ask for a box first when there is none to fill", () => {
    const result = addAsNextBoxReference(draft({ mode: "edit" }), "fox", "fox");
    expect(result).toMatchObject({ added: false, message: expect.stringMatching(/Draw a Change box/) });
    expect(result.draft.mode).toBe("edit");
  });
});
