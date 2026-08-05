import { Volume2, VolumeX } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { FLUX3_ASPECT_RATIOS, flux3MaxDuration, type Flux3VideoAspectRatio } from "@/lib/flux3-video";
import type { VideoScriptSettings as VideoScriptSettingsValue } from "@/lib/video-script-plan";
import { VIDEO_SCRIPT_DURATION_PRESETS, type VideoScriptEditorRow } from "@/lib/video-script/types";

/**
 * Batch settings with the PRD defaults (hd, 8s, 16:9, audio on, draft-first,
 * safety 2) plus the per-row override editor. Validation is not repeated here:
 * the planner reports it per row in the plan preview.
 */
export type VideoScriptSettingsProps = {
  settings: VideoScriptSettingsValue;
  onChange: (settings: VideoScriptSettingsValue) => void;
  /** Row whose override is being edited, when the matrix opened one. */
  overrideRow?: VideoScriptEditorRow | null;
  onOverrideChange?: (override: Partial<VideoScriptSettingsValue> | undefined) => void;
};

const MAX_DURATION = flux3MaxDuration("i2v");

export function VideoScriptSettings(props: VideoScriptSettingsProps) {
  const { settings } = props;
  const override = props.overrideRow?.settingsOverride;
  const effective = { ...settings, ...(override || {}) };

  function update(patch: Partial<VideoScriptSettingsValue>) {
    props.onChange({ ...settings, ...patch });
  }

  return (
    <section className="videoScriptSettings">
      <div className="runLogHeader">
        <span>Settings</span>
        <small>batch defaults</small>
      </div>

      <div className="videoScriptChoiceRow">
        {VIDEO_SCRIPT_DURATION_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={settings.duration === seconds ? "active" : ""}
            onClick={() => update({ duration: seconds })}
            title={seconds === 20 ? "20 seconds is an explicit high-cost choice" : `${seconds} second clips`}
          >
            {seconds}s
          </button>
        ))}
      </div>

      <div className="videoScriptSettingsGrid">
        <label>
          <span>Duration</span>
          <NumberField
            min={5}
            max={MAX_DURATION}
            value={typeof settings.duration === "number" ? settings.duration : ""}
            onCommit={(value) => update({ duration: value })}
          />
        </label>
        <label>
          <span>Aspect</span>
          <select
            value={settings.aspectRatio}
            onChange={(event) => update({ aspectRatio: event.target.value as Flux3VideoAspectRatio })}
          >
            {FLUX3_ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Resolution</span>
          <select
            value={settings.resolution}
            onChange={(event) => update({ resolution: event.target.value === "fhd" ? "fhd" : "hd" })}
          >
            <option value="hd">hd</option>
            <option value="fhd">fhd</option>
          </select>
        </label>
        <label>
          <span>Safety</span>
          <NumberField
            min={0}
            max={2}
            value={settings.safetyTolerance}
            onCommit={(value) => update({ safetyTolerance: value })}
          />
        </label>
      </div>

      <div className="videoScriptToggles">
        <button
          type="button"
          className={settings.draft ? "active" : ""}
          onClick={() => update({ draft: !settings.draft })}
          title="Draft-first keeps the batch cheap; enhance the drafts you keep"
        >
          Draft first
        </button>
        <button
          type="button"
          className={settings.generateAudio ? "active" : ""}
          onClick={() => update({ generateAudio: !settings.generateAudio })}
        >
          {settings.generateAudio ? <Volume2 size={13} /> : <VolumeX size={13} />}
          Audio
        </button>
      </div>

      {props.overrideRow && props.onOverrideChange && (
        <div className="videoScriptOverride">
          <div className="runLogHeader">
            <span>Row override</span>
            <button type="button" onClick={() => props.onOverrideChange?.(undefined)} disabled={!override}>
              Reset to batch
            </button>
          </div>
          <div className="videoScriptSettingsGrid">
            <label>
              <span>Duration</span>
              <NumberField
                min={5}
                max={MAX_DURATION}
                value={typeof effective.duration === "number" ? effective.duration : ""}
                onCommit={(value) => props.onOverrideChange?.({ ...override, duration: value })}
              />
            </label>
            <label>
              <span>Resolution</span>
              <select
                value={effective.resolution}
                onChange={(event) =>
                  props.onOverrideChange?.({ ...override, resolution: event.target.value === "fhd" ? "fhd" : "hd" })
                }
              >
                <option value="hd">hd</option>
                <option value="fhd">fhd</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
