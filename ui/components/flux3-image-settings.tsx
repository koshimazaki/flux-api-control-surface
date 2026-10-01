import { Globe, GlobeLock } from "lucide-react";
import {
  FLUX3_IMAGE_ASPECT_RATIOS,
  FLUX3_IMAGE_RESOLUTIONS,
  type Flux3ImageAspectRatio,
  type Flux3ImageResolution,
  type Flux3ImageSettings
} from "@/lib/flux3-image";

const resolutionLabels: Record<Flux3ImageResolution, string> = {
  "768sq": "768 (draft)",
  "1k": "1K",
  "2k": "2K",
  "4k": "4K (slow)"
};

type Flux3ImageSettingsFieldsProps = {
  settings: Flux3ImageSettings;
  onChange: (settings: Flux3ImageSettings) => void;
  /** USD per image, from BFL's price list. */
  estimate: number | null;
  /** Edits with boxes keep the source frame, so the aspect ratio is fixed at Auto. */
  aspectLocked?: boolean;
  /** Why the aspect ratio behaves as it does in this mode, if it needs saying. */
  aspectNote?: string;
};

/**
 * The settings `POST /v1/flux-3-image` publishes, laid out like the FLUX 3
 * video controls: aspect ratio, resolution tier, grounding and safety
 * tolerance, then the model and price box.
 */
export function Flux3ImageSettingsFields({ settings, onChange, estimate, aspectLocked = false, aspectNote }: Flux3ImageSettingsFieldsProps) {
  const set = (patch: Partial<Flux3ImageSettings>) => onChange({ ...settings, ...patch });
  return (
    <>
      <div className="flux3SettingsGrid">
        <label>
          Aspect
          <select
            value={aspectLocked ? "auto" : settings.aspectRatio}
            disabled={aspectLocked}
            title={aspectNote}
            onChange={(event) => set({ aspectRatio: event.target.value as Flux3ImageAspectRatio })}
          >
            {FLUX3_IMAGE_ASPECT_RATIOS.map((ratio) => (
              <option value={ratio} key={ratio}>
                {ratio === "auto" ? "Auto" : ratio}
              </option>
            ))}
          </select>
        </label>
        <label>
          Resolution
          <select value={settings.resolution} onChange={(event) => set({ resolution: event.target.value as Flux3ImageResolution })}>
            {FLUX3_IMAGE_RESOLUTIONS.map((tier) => (
              <option value={tier} key={tier}>
                {resolutionLabels[tier]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Safety
          <select value={settings.safetyTolerance} onChange={(event) => set({ safetyTolerance: Number(event.target.value) })}>
            {[0, 1, 2, 3, 4].map((level) => (
              <option value={level} key={level}>
                {level === 0 ? "0 (strictest)" : level === 4 ? "4 (most lenient)" : level}
              </option>
            ))}
          </select>
        </label>
      </div>
      {aspectNote && <small className="flux3SettingsNote">{aspectNote}</small>}
      <label className="toggle flux3Toggle" title="Lets FLUX 3 ground the prompt in web and image search">
        <input type="checkbox" checked={settings.grounding} onChange={(event) => set({ grounding: event.target.checked })} />
        {settings.grounding ? <Globe size={16} /> : <GlobeLock size={16} />}
        Grounding: web and image search
      </label>
      <div className="flux3CostBox">
        <div>
          <span>Model</span>
          <strong>FLUX 3 Image</strong>
        </div>
        <div>
          <span>Estimate</span>
          <strong>{estimate === null ? "Not listed" : `$${estimate.toFixed(3)}`}</strong>
        </div>
        <small>Per image, by resolution. The run log records the credits each image actually used.</small>
      </div>
    </>
  );
}
