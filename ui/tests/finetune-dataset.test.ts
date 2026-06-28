import { describe, expect, it } from "vitest";
import {
  buildKleinLoraConfigYaml,
  buildKleinLoraDataset,
  ensureCaptionTrigger,
  resolveKleinLoraConfig,
  type KleinLoraConfigOptions
} from "@/lib/finetune-dataset";
import { sanitizeZipName } from "@/lib/zip-archive";
import type { TrainingCollection, TrainingCollectionItem } from "@/lib/types";

// 1x1 PNG so dataUrlToBytes has real base64 to decode.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function item(partial: Partial<TrainingCollectionItem> & { name: string; caption: string }): TrainingCollectionItem {
  return {
    id: `item_${partial.name}`,
    source: "file",
    fileName: `${partial.name}.png`,
    imageDataUrl: PNG_1x1,
    mimeType: "image/png",
    addedAt: 0,
    ...partial
  };
}

const collection: TrainingCollection = {
  id: "col_1",
  name: "Test Klein Collection",
  triggerToken: "bfl_testflower",
  captionGuide: "",
  createdAt: 0,
  updatedAt: 0,
  items: [
    item({ name: "Red Bloom", caption: "bfl_testflower, a translucent red bloom" }),
    item({ name: "Empty Caption", caption: "" }),
    item({ name: "No Trigger", caption: "a blue cybernetic stem" })
  ]
};

describe("buildKleinLoraDataset", () => {
  it("emits a flat image + same-basename .txt sidecar layout under one dataset folder", () => {
    const dataset = buildKleinLoraDataset(collection);
    const imageNames = dataset.files.filter((file) => file.name.endsWith(".png")).map((file) => file.name);
    const captionNames = dataset.files.filter((file) => file.name.endsWith(".txt")).map((file) => file.name);

    expect(dataset.imageCount).toBe(3);
    expect(imageNames).toHaveLength(3);
    expect(captionNames).toHaveLength(3);

    // Every image has a co-located caption with an identical basename.
    for (const imageName of imageNames) {
      const sidecar = imageName.replace(/\.png$/, ".txt");
      expect(captionNames).toContain(sidecar);
      // Same directory (the dataset folder) — not split into images/ + captions/.
      expect(imageName.startsWith("dataset/")).toBe(true);
      expect(imageName.split("/").length).toBe(2);
    }
    // The old images/ + captions/ split must not be present.
    expect(dataset.files.some((file) => file.name.startsWith("images/"))).toBe(false);
    expect(dataset.files.some((file) => file.name.startsWith("captions/"))).toBe(false);
  });

  it("guarantees the trigger word appears in every caption", () => {
    const dataset = buildKleinLoraDataset(collection);
    const captions = dataset.files
      .filter((file) => file.name.endsWith(".txt"))
      .map((file) => String(file.content));

    expect(captions).toHaveLength(3);
    for (const caption of captions) {
      expect(caption.toLowerCase()).toContain("bfl_testflower");
    }
    // The "no trigger" caption gets the trigger prepended, original text kept.
    expect(captions.some((caption) => caption.includes("a blue cybernetic stem"))).toBe(true);
  });

  it("writes a config.yaml carrying the klein base model and trigger word", () => {
    const dataset = buildKleinLoraDataset(collection);
    const config = dataset.files.find((file) => file.name === "config.yaml");
    expect(config).toBeDefined();
    const yaml = String(config?.content);

    expect(yaml).toContain("black-forest-labs/FLUX.2-klein-9B");
    expect(yaml).toContain("bfl_testflower");
    expect(yaml).toContain('folder_path: "dataset"');
    expect(yaml).toContain("resolution: [1024]");
    expect(dataset.config.baseModel).toBe("black-forest-labs/FLUX.2-klein-9B");
  });

  it("includes a README with AI-Toolkit and Diffusers run commands", () => {
    const dataset = buildKleinLoraDataset(collection);
    const readme = dataset.files.find((file) => file.name === "README.md");
    const text = String(readme?.content);

    expect(text).toContain("ai-toolkit");
    expect(text).toContain("python run.py config.yaml");
    expect(text).toContain("load_lora_weights");
    expect(text).toContain("bfl_testflower");
  });

  it("produces deterministic filenames across rebuilds", () => {
    const first = buildKleinLoraDataset(collection).files.map((file) => file.name);
    const second = buildKleinLoraDataset(collection).files.map((file) => file.name);

    expect(first).toEqual(second);
    expect(first).toContain("dataset/01_red-bloom.png");
    expect(first).toContain("dataset/01_red-bloom.txt");
    expect(first).toContain("dataset/03_no-trigger.png");
  });

  it("threads config overrides into the resolved config and YAML", () => {
    const dataset = buildKleinLoraDataset(collection, { resolution: 1536, rank: 32, steps: 3000 });
    expect(dataset.config.resolution).toBe(1536);
    expect(dataset.config.rank).toBe(32);
    expect(dataset.config.alpha).toBe(32);

    const yaml = buildKleinLoraConfigYaml(dataset.config);
    expect(yaml).toContain("resolution: [1536]");
    expect(yaml).toContain("linear: 32");
    expect(yaml).toContain("steps: 3000");
  });
});

describe("ensureCaptionTrigger / resolveKleinLoraConfig", () => {
  it("keeps an existing trigger, fills empty captions, and prepends when missing", () => {
    expect(ensureCaptionTrigger("bfl_x, a thing", "bfl_x")).toBe("bfl_x, a thing");
    expect(ensureCaptionTrigger("", "bfl_x")).toBe("bfl_x, ");
    expect(ensureCaptionTrigger(undefined, "bfl_x")).toBe("bfl_x, ");
    expect(ensureCaptionTrigger("a thing", "bfl_x")).toBe("bfl_x, a thing");
  });

  it("falls back to a default trigger token and slugified job name", () => {
    const config = resolveKleinLoraConfig({ name: "My Cool LoRA", triggerToken: "" });
    expect(config.triggerToken).toBe("bfl_cyberflower");
    expect(config.name).toBe("my-cool-lora");
    expect(config.baseModel).toBe("black-forest-labs/FLUX.2-klein-9B");
    expect(config.resolution).toBe(1024);
  });
});

describe("FLUX.2 klein dataset hardening", () => {
  it("sanitizes zip entry names after removing traversal segments", () => {
    expect(sanitizeZipName("../../evil:folder\\file.png")).toBe("evil-folder/file.png");
  });

  it("uses a resolvable HF base model id, consistent across config + README", () => {
    const dataset = buildKleinLoraDataset(collection);
    expect(dataset.config.baseModel).toBe("black-forest-labs/FLUX.2-klein-9B");
    const yaml = String(dataset.files.find((file) => file.name === "config.yaml")?.content);
    const readme = String(dataset.files.find((file) => file.name === "README.md")?.content);
    expect(yaml).toContain('name_or_path: "black-forest-labs/FLUX.2-klein-9B"');
    expect(readme).toContain("black-forest-labs/FLUX.2-klein-9B");
  });

  it("rejects non-image data URLs instead of writing arbitrary bytes", () => {
    const bad: TrainingCollection = {
      ...collection,
      items: [item({ name: "bad", caption: "x", imageDataUrl: "data:text/plain;base64,aGVsbG8=" })]
    };
    expect(() => buildKleinLoraDataset(bad)).toThrow(/data:image/);
  });

  it("caps the dataset item count", () => {
    const many = Array.from({ length: 201 }, (_, index) => item({ name: `n${index}`, caption: "x" }));
    expect(() => buildKleinLoraDataset({ ...collection, items: many })).toThrow(/capped at 200/);
  });

  it("escapes untrusted trigger words so they cannot break the YAML", () => {
    const evil = 'bad"\ntop_level: pwned';
    const yaml = buildKleinLoraConfigYaml(resolveKleinLoraConfig({ name: "x", triggerToken: evil }));
    // The injected newline + quote cannot introduce a real top-level YAML key.
    expect(yaml).not.toMatch(/^top_level:/m);
    expect(yaml).toContain('\\"');
  });

  it("rejects a real-image MIME wrapping non-image bytes (magic-byte sniff)", () => {
    // Passes the data:image/png regex + size checks, but the bytes ("hello") are
    // not a PNG/JPEG/WebP, so the magic-byte sniff must reject it.
    const spoofed: TrainingCollection = {
      ...collection,
      items: [item({ name: "spoof", caption: "x", imageDataUrl: "data:image/png;base64,aGVsbG8=" })]
    };
    expect(() => buildKleinLoraDataset(spoofed)).toThrow(/not a valid PNG, JPEG, or WebP/);
  });

  it("rejects a partial PNG signature (first 4 magic bytes only, not the full 8)", () => {
    // base64 of [0x89,0x50,0x4e,0x47,0,0,0,0] — "\x89PNG" then zeros, NOT the full
    // 89 50 4E 47 0D 0A 1A 0A signature. The old 4-byte check wrongly accepted it.
    const partialPng: TrainingCollection = {
      ...collection,
      items: [item({ name: "partial", caption: "x", imageDataUrl: "data:image/png;base64,iVBORwAAAAA=" })]
    };
    expect(() => buildKleinLoraDataset(partialPng)).toThrow(/not a valid PNG, JPEG, or WebP/);
  });

  it("strips control characters from an overridden base model so it cannot break the YAML comment", () => {
    const config = resolveKleinLoraConfig(
      { name: "x", triggerToken: "bfl_x" },
      { baseModel: "evil-model\ninjected: true" }
    );
    // The newline collapses to a space; no raw control char survives into the config.
    expect(config.baseModel).not.toContain("\n");
    expect(config.baseModel).toBe("evil-model injected: true");
    // And the interpolated comment can't spawn a real top-level YAML key.
    expect(buildKleinLoraConfigYaml(config)).not.toMatch(/^injected:/m);
  });

  it("coerces non-string JSON config values instead of throwing (raw-route input)", () => {
    // The dataset route forwards raw JSON config, so a number can arrive where a
    // string is typed (e.g. learningRate: 0.0001). It must coerce, not throw on
    // .trim()/.replace()/.toLowerCase().
    const rawConfig = {
      learningRate: 0.0001,
      name: 123,
      triggerToken: 456,
      datasetDir: 789
    } as unknown as KleinLoraConfigOptions;
    const config = resolveKleinLoraConfig({ name: "x", triggerToken: "bfl_x" }, rawConfig);
    expect(config.learningRate).toBe("0.0001");
    expect(config.name).toBe("123");
    expect(config.triggerToken).toBe("456");
    expect(config.datasetDir).toBe("789");
    // A full build with numeric config must succeed end-to-end (previously 400'd).
    expect(() => buildKleinLoraDataset(collection, rawConfig)).not.toThrow();
  });
});
