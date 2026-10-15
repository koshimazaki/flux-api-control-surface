import { Globe, GlobeLock } from "lucide-react";
import {
  FLUX3_IMAGE_ASPECT_RATIOS,
  FLUX3_IMAGE_KLEIN_MODEL,
  FLUX3_IMAGE_KLEIN_RESOLUTIONS,
  FLUX3_IMAGE_MODEL,
  FLUX3_IMAGE_RESOLUTIONS,
  defaultFlux3ImageSettings,
  normalizeFlux3ImageSettings,
  type Flux3ImageAspectRatio,
  type Flux3ImageResolution,
  type Flux3ImageSettings
} from "@/lib/flux3-image";

const resolutionLabels: Record<Flux3ImageResolution, string> = {
  "768sq": "768 (draft)", "1k": "1K", "1.5k": "1.5K", "2k": "2K", "4k": "4K (slow)"
};

type Flux3ImageSettingsFieldsProps = {
  settings: Flux3ImageSettings;
  onChange: (settings: Flux3ImageSettings) => void;
  estimate: number | null;
  aspectLocked?: boolean;
  aspectNote?: string;
};

/** Each model exposes its own published settings and request defaults. */
export function Flux3ImageSettingsFields({ settings, onChange, estimate, aspectLocked = false, aspectNote }: Flux3ImageSettingsFieldsProps) {
  const set = (patch: Partial<Flux3ImageSettings>) => onChange({ ...settings, ...patch });
  const klein = settings.model === FLUX3_IMAGE_KLEIN_MODEL;
  return (
    <>
      <div className="flux3SettingsGrid">
        <label>
          Model
          <select value={settings.model ?? FLUX3_IMAGE_MODEL} onChange={(event) => onChange(
            event.target.value === FLUX3_IMAGE_KLEIN_MODEL
              ? normalizeFlux3ImageSettings({ model: FLUX3_IMAGE_KLEIN_MODEL })
              : { ...defaultFlux3ImageSettings }
          )}>
            <option value={FLUX3_IMAGE_MODEL}>FLUX 3 Image</option>
            <option value={FLUX3_IMAGE_KLEIN_MODEL}>FLUX 3 Image Klein</option>
          </select>
        </label>
        <label>
          Resolution
          <select value={settings.resolution ?? ""} onChange={(event) => set({ resolution: (event.target.value || null) as Flux3ImageResolution | null })}>
            {klein && <option value="">Auto (1K text / source size edit)</option>}
            {(klein ? FLUX3_IMAGE_KLEIN_RESOLUTIONS : FLUX3_IMAGE_RESOLUTIONS).map((tier) => (
              <option value={tier} key={tier}>{resolutionLabels[tier]}</option>
            ))}
          </select>
        </label>
        <label>
          Aspect
          <select value={aspectLocked ? "auto" : settings.aspectRatio} disabled={aspectLocked} title={aspectNote}
            onChange={(event) => set({ aspectRatio: event.target.value as Flux3ImageAspectRatio })}>
            {FLUX3_IMAGE_ASPECT_RATIOS.map((ratio) => <option value={ratio} key={ratio}>{ratio === "auto" ? "Auto" : ratio}</option>)}
          </select>
        </label>
        <label>
          Safety
          <select value={settings.safetyTolerance} onChange={(event) => set({ safetyTolerance: Number(event.target.value) })}>
            {Array.from({ length: klein ? 8 : 5 }, (_, level) => (
              <option value={level} key={level}>{level === 0 ? "0 (strictest)" : level}</option>
            ))}
          </select>
        </label>
        {klein && <>
          <label>Format
            <select value={settings.outputFormat ?? "jpeg"} onChange={(event) => set({ outputFormat: event.target.value as "jpeg" | "png" })}>
              <option value="jpeg">JPEG</option><option value="png">PNG</option>
            </select>
          </label>
          <label>Steps
            <input type="number" min={1} max={16} step={1} placeholder="16" value={settings.steps ?? ""}
              onChange={(event) => set({ steps: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          <label>Seed
            <input type="number" min={0} max={4294967295} step={1} placeholder="Random" value={settings.seed ?? ""}
              onChange={(event) => set({ seed: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          {(["width", "height"] as const).map((side) => <label key={side}>
            {side === "width" ? "Width (px)" : "Height (px)"}
            <input type="number" min={64} max={6256} step={1} placeholder="Auto" value={settings[side] ?? ""} disabled={aspectLocked}
              onChange={(event) => set({ [side]: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>)}
        </>}
      </div>
      {aspectNote && <small className="flux3SettingsNote">{aspectNote}</small>}
      {klein ? <small className="flux3SettingsNote">Set width and height together to override resolution and aspect (up to 16.8 MP). Safety levels require organization approval.</small> :
        <label className="toggle flux3Toggle" title="Lets FLUX 3 ground the prompt in web and image search">
          <input type="checkbox" checked={settings.grounding} onChange={(event) => set({ grounding: event.target.checked })} />
          {settings.grounding ? <Globe size={16} /> : <GlobeLock size={16} />}
          Grounding: web and image search
        </label>}
      <div className="flux3CostBox">
        <div><span>Model</span><strong>{klein ? "FLUX 3 Image Klein" : "FLUX 3 Image"}</strong></div>
        <div><span>Estimate</span><strong>{estimate === null ? "Not listed" : `$${estimate.toFixed(3)}`}</strong></div>
        <small>{klein ? "Requires BFL access. Price is not listed; actual credits are recorded after generation." :
          "Per image, by resolution. The run log records the credits each image actually used."}</small>
      </div>
    </>
  );
}
