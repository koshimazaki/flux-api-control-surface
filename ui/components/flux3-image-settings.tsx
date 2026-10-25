import { Globe, GlobeLock } from "lucide-react";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  FLUX3_IMAGE_ASPECT_RATIOS, FLUX3_IMAGE_KLEIN_MODEL, FLUX3_IMAGE_KLEIN_RESOLUTIONS,
  FLUX3_IMAGE_MODEL, FLUX3_IMAGE_MODELS, FLUX3_IMAGE_MODEL_LABELS, FLUX3_IMAGE_RESOLUTIONS,
  normalizeFlux3ImageSettings, type Flux3ImageResolution, type Flux3ImageSettings
} from "@/lib/flux3-image";

const resolutionLabels: Record<Flux3ImageResolution, string> = {
  "768sq": "768 (draft)", "1k": "1K", "1.5k": "1.5K", "2k": "2K", "4k": "4K (slow)", "match_input": "Match input (edits)"
};

type Flux3ImageSettingsFieldsProps = {
  settings: Flux3ImageSettings;
  onChange: (settings: Flux3ImageSettings) => void;
  estimate: number | null;
  aspectLocked?: boolean;
  aspectNote?: string;
};

/** Theme-aware controls follow each model's published contract. */
export function Flux3ImageSettingsFields({ settings, onChange, estimate, aspectLocked = false, aspectNote }: Flux3ImageSettingsFieldsProps) {
  const set = (patch: Partial<Flux3ImageSettings>) => onChange({ ...settings, ...patch });
  const model = settings.model ?? FLUX3_IMAGE_MODEL;
  const klein = model === FLUX3_IMAGE_KLEIN_MODEL;
  return (
    <>
      <div className="flux3SettingsGrid">
        <div className="themedSelectField">
          <span>Model</span>
          <ThemedSelect label="Model" value={model}
            options={FLUX3_IMAGE_MODELS.map((value) => ({ value, label: FLUX3_IMAGE_MODEL_LABELS[value] }))}
            onChange={(next) => {
              const shared = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "grounding"));
              onChange(normalizeFlux3ImageSettings({ ...shared, model: next }));
            }} />
        </div>
        <div className="themedSelectField">
          <span>Resolution</span>
          <ThemedSelect label="Resolution" value={settings.resolution ?? ""}
            options={[
              ...(klein ? [{ value: "", label: "Auto (1K text / source size edit)" }] : []),
              ...(klein ? FLUX3_IMAGE_KLEIN_RESOLUTIONS : FLUX3_IMAGE_RESOLUTIONS).map((tier) => ({ value: tier, label: resolutionLabels[tier] }))
            ]}
            onChange={(value) => set({ resolution: (value || null) as Flux3ImageResolution | null })} />
        </div>
        <div className="themedSelectField">
          <span>Aspect ratio</span>
          <ThemedSelect label="Aspect ratio" value={aspectLocked ? "auto" : settings.aspectRatio}
            disabled={aspectLocked} title={aspectNote}
            options={FLUX3_IMAGE_ASPECT_RATIOS.map((value) => ({ value, label: value === "auto" ? "Auto" : value }))}
            onChange={(aspectRatio) => set({ aspectRatio })} />
        </div>
        <div className="themedSelectField">
          <span>Filtering</span>
          <ThemedSelect label="Filtering" value={String(settings.safetyTolerance)}
            options={Array.from({ length: 8 }, (_, level) => ({ value: String(level), label: level === 0 ? "0 (strictest)" : String(level) }))}
            onChange={(level) => set({ safetyTolerance: Number(level) })} />
        </div>
        {klein && <>
          <div className="themedSelectField">
            <span>Format</span>
            <ThemedSelect label="Format" value={settings.outputFormat ?? "jpeg"}
              options={[{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }]}
              onChange={(outputFormat) => set({ outputFormat })} />
          </div>
          <label>Steps
            <input type="number" min={1} max={16} step={1} placeholder="16" value={settings.steps ?? ""}
              onChange={(event) => set({ steps: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          <label>Seed
            <input type="number" min={0} max={4294967295} step={1} placeholder="Random" value={settings.seed ?? ""}
              onChange={(event) => set({ seed: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
        </>}
          {(["width", "height"] as const).map((side) => <label key={side}>
            {side === "width" ? "Width (px)" : "Height (px)"}
            <input type="number" min={klein ? 64 : 256} max={6256} step={1} placeholder="Auto" value={settings[side] ?? ""} disabled={klein && aspectLocked}
              onChange={(event) => set({ [side]: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>)}
      </div>
      <small className="flux3SettingsNote">Set width and height together to override resolution and aspect. Standard: up to 16.8 MP, or 4 MP with references. Filtering levels depend on organization approval.</small>
      {aspectNote && <small className="flux3SettingsNote">{aspectNote}</small>}
      {klein ? <small className="flux3SettingsNote">Width and height override resolution and aspect for unboxed runs (up to 16.8 MP). Boxed edits and layouts keep their frame. Filtering levels depend on organization approval.</small> :
        <label className="toggle flux3Toggle" title="Lets FLUX 3 ground the prompt in web and image search">
          <input type="checkbox" checked={settings.grounding} onChange={(event) => set({ grounding: event.target.checked })} />
          {settings.grounding ? <Globe size={16} /> : <GlobeLock size={16} />}
          Grounding: web and image search
        </label>}
      <div className="flux3CostBox">
        <div><span>Model</span><strong>{FLUX3_IMAGE_MODEL_LABELS[model]}</strong></div>
        <div><span>Estimate</span><strong>{estimate === null ? "Not listed" : `$${estimate.toFixed(3)}`}</strong></div>
        <small>{klein ? "Price is not listed; the run log records actual credits after generation." :
          "Per image, by resolution. The run log records the credits each image actually used."}</small>
      </div>
    </>
  );
}
