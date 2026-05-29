import type { PromptRecord } from "./types";

export function parsePromptObject(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { scene: "cybernetic botanical specimen", subjects: [{ description: raw }] };
  }
}

export function promptSubjects(prompt: any) {
  return Array.isArray(prompt.subjects) ? prompt.subjects : [];
}

export function uniqueText(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function combinations<T>(items: T[], size: number) {
  const result: T[][] = [];
  function visit(start: number, combo: T[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      combo.push(items[index]);
      visit(index + 1, combo);
      combo.pop();
    }
  }
  visit(0, []);
  return result;
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function comboIdFromPrompts(chosen: PromptRecord[], prefix = "combo") {
  const sourceSlug = chosen.map((record) => record.id.replace(/_0\d$/, "")).join("_x_");
  return `${prefix}_${sourceSlug}`.slice(0, prefix === "combo" ? 96 : 120);
}

export function buildComboPromptObject(chosen: PromptRecord[]) {
  const parsed = chosen.map((record) => ({ record, prompt: parsePromptObject(record.prompt) }));
  const promptsOnly = parsed.map((item) => item.prompt);
  const descriptions = parsed.flatMap(({ prompt }) =>
    promptSubjects(prompt).map((subject: any) => subject.description).filter(Boolean)
  );
  const species = uniqueText(chosen.map((record) => record.species));
  const forms = uniqueText(chosen.map((record) => record.plant_form));
  const environments = uniqueText(promptsOnly.map((prompt) => prompt.environment));
  const lightings = uniqueText(promptsOnly.map((prompt) => prompt.lighting));
  const styles = uniqueText(promptsOnly.map((prompt) => prompt.style));
  const materials = uniqueText(promptsOnly.map((prompt) => prompt.materials));

  return {
    prompt_format: "json",
    scene: "cinematic macro photograph of a single cybernetic botanical hybrid specimen",
    combo: {
      mode: "multi-source botanical fusion",
      source_count: chosen.length,
      source_ids: chosen.map((record) => record.id),
      directive:
        "Fuse the selected source plants into one coherent cybernetic flower, not a collage and not multiple separate specimens."
    },
    subjects: [
      {
        description: `single hybrid cybernetic flower combining ${species.join(" + ") || "selected botanical species"}; ${descriptions.join("; ")}`,
        source_influences: parsed.map(({ record, prompt }) => ({
          id: record.id,
          species: record.species,
          seed: record.seed,
          plant_form: record.plant_form,
          anatomy: promptSubjects(prompt)[0]?.description || record.plant_form || record.species
        })),
        fused_anatomy: [
          "one readable central bloom with merged botanical anatomy",
          forms.length ? `combined plant forms: ${forms.join(" + ")}` : "",
          "cybernetic filaments, tendrils, membranes, seed structures, and living mechanical detail resolved as one organism"
        ]
          .filter(Boolean)
          .join("; "),
        position: "centered dominant specimen, readable at thumbnail size",
        action: "held still as a training-ready source image with recognizable combined plant anatomy"
      }
    ],
    style:
      styles.join(" + ") ||
      "cinematic detailed film photography, botanical macro film still, natural grain, premium source-image quality, creamy optical bokeh",
    environment: environments.join(" blended with "),
    lighting: lightings.join(" blended with "),
    composition:
      "clean silhouette, coherent hybrid anatomy, one dominant subject with stable crop margins, each selected plant influence visibly represented",
    camera: promptsOnly.find((prompt) => prompt.camera)?.camera || {
      angle: "botanical macro study",
      lens: "100mm macro lens",
      depth_of_field: "controlled shallow depth of field with critical anatomy sharp"
    },
    materials:
      materials.join(" + ") ||
      "believable transitions between living plant tissue, translucent membranes, wet organic texture, ceramic or metallic cybernetic detail",
    delivery: "clean unmarked label-free specimen image with a blank botanical background and plain continuous framing",
    combo_sources: chosen.map((record) => ({
      id: record.id,
      species: record.species,
      seed: record.seed,
      plant_form: record.plant_form,
      prompt: parsePromptObject(record.prompt)
    }))
  };
}

export function buildComboPrompt(chosen: PromptRecord[]) {
  return JSON.stringify(buildComboPromptObject(chosen), null, 2);
}
