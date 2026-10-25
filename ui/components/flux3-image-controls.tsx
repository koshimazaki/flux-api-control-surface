import { Images, LayoutGrid, MessageSquareText, Target, WandSparkles } from "lucide-react";
import type { ComponentProps } from "react";
import { RegionList } from "@/components/flux3-image-regions";
import { Flux3ImageSettingsFields } from "@/components/flux3-image-settings";
import { JobQueue } from "@/components/ui/job-queue";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { Size } from "@/lib/canvas-geometry";
import type { Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import { FLUX3_IMAGE_MAX_REFERENCES, type Flux3ImageMode, type Flux3ImageSettings } from "@/lib/flux3-image";

const modeOptions: Array<{ id: Flux3ImageMode; label: string; detail: string; icon: typeof WandSparkles }> = [
  { id: "t2i", label: "Text", detail: "Prompt, optional layout", icon: MessageSquareText },
  { id: "i2i", label: "Image", detail: `1–${FLUX3_IMAGE_MAX_REFERENCES} references`, icon: Images },
  { id: "edit", label: "Edit", detail: "Whole image", icon: WandSparkles },
  { id: "precise", label: "Precise", detail: "Boxes: change, keep, move", icon: Target }
];

const promptLabels: Record<Flux3ImageMode, string> = {
  t2i: "Image prompt",
  i2i: "Prompt using the references",
  edit: "Edit instruction",
  precise: "Overall instruction (optional)"
};

const promptPlaceholders: Record<Flux3ImageMode, string> = {
  t2i: "Describe the image…",
  i2i: "The character from image 1 in the jacket from image 2, lit like image 3…",
  edit: "Describe the change to the whole image…",
  precise: "Anything for the whole edit, such as keeping the lighting warm…"
};

type RegionListProps = ComponentProps<typeof RegionList>;

type Flux3ImageControlsProps = {
  draft: Flux3ImageDraft;
  /** Text to image with its layout boxes on. */
  layoutMode: boolean;
  layoutFrame: Size;
  /** The box list's callbacks, shared with the boxes on the stage. */
  regionCallbacks: Omit<RegionListProps, "regions" | "frame">;
  estimate: number | null;
  blocker: string | null;
  notice: string;
  isRunning: boolean;
  /** The server queue, so FLUX 3 Image jobs line up, pause, retry and cancel like any other. */
  queue: ComponentProps<typeof JobQueue>;
  onModeChange: (mode: Flux3ImageMode) => void;
  onDraftChange: (patch: Partial<Flux3ImageDraft>) => void;
  onSettingsChange: (settings: Flux3ImageSettings) => void;
  onSubmit: () => void;
};

/** The FLUX 3 Image run column: mode, boxes, prompt, settings, the job queue and Generate. */
export function Flux3ImageControls(props: Flux3ImageControlsProps) {
  const { draft, layoutMode } = props;
  const boxes = layoutMode ? draft.layoutRegions : draft.regions;
  const aspectNote =
    draft.mode === "precise"
      ? "Boxes follow the source frame, so edits use Auto."
      : layoutMode && draft.settings.aspectRatio === "auto"
        ? "Auto lays the frame out square."
        : undefined;

  return (
    <aside className="panel controls toolControls flux3ImageControls">
      <PanelHeader title="Create image" subtitle="Text, references, edits, boxes">
        <WandSparkles size={18} aria-label="FLUX 3 Image" />
      </PanelHeader>
      <div className="flux3ModePicker">
        {modeOptions.map(({ id, label, detail, icon: Icon }) => (
          <button type="button" className={draft.mode === id ? "active" : ""} key={id} onClick={() => props.onModeChange(id)}>
            <Icon size={16} />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </div>

      {draft.mode === "t2i" && (
        <label className="toggle flux3Toggle" title="Place each element with a box on a frame of the chosen aspect ratio">
          <input type="checkbox" checked={draft.layoutEnabled} onChange={(event) => props.onDraftChange({ layoutEnabled: event.target.checked })} />
          <LayoutGrid size={16} />
          Lay out with boxes
        </label>
      )}
      {(draft.mode === "precise" || layoutMode) && (
        <>
          <p className="toolStubNote">
            {layoutMode
              ? "Drag a box for each element and say what goes in it. Boxes guide placement; elements can spill over slightly."
              : "Drag a box over each thing to change, keep, move or remove. Keep boxes anchor what must not move. Boxes guide the edit; they are not masks."}
          </p>
          <RegionList regions={boxes} frame={layoutMode ? props.layoutFrame : draft.regionFrame} {...props.regionCallbacks} />
        </>
      )}

      {draft.mode === "i2i" && (
        <p className="toolStubNote">
          Drop up to {FLUX3_IMAGE_MAX_REFERENCES} references on the numbered slots and name them in the prompt as image 1,
          image 2 and so on.
        </p>
      )}
      {draft.mode === "edit" && (
        <p className="toolStubNote">Drag a box on the image to edit only that area; the edit becomes a precise one.</p>
      )}
      <label>
        {promptLabels[draft.mode]}
        <textarea
          className="toolPrompt"
          rows={draft.mode === "precise" ? 3 : 5}
          value={draft.prompts[draft.mode]}
          onChange={(event) => props.onDraftChange({ prompts: { ...draft.prompts, [draft.mode]: event.target.value } })}
          placeholder={promptPlaceholders[draft.mode]}
        />
      </label>

      <Flux3ImageSettingsFields
        settings={draft.settings}
        onChange={props.onSettingsChange}
        estimate={props.estimate}
        aspectLocked={draft.mode === "precise"}
        aspectNote={aspectNote}
      />
      {props.notice && <p className="flux3Warning">{props.notice}</p>}
      <JobQueue {...props.queue} />
      {/* Clicks stack: each one is its own queue job, as in FLUX.2. */}
      <RunButton isRunning={props.isRunning} onClick={props.onSubmit} disabled={Boolean(props.blocker)} disableWhenRunning={false} icon={WandSparkles}>
        {draft.mode === "t2i" || draft.mode === "i2i" ? "Generate image" : "Apply edit"}
      </RunButton>
      {props.blocker && <p className="flux3Blocker">{props.blocker}</p>}
    </aside>
  );
}
