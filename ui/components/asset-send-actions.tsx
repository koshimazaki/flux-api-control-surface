import {
  ChevronDown,
  Clapperboard,
  Eraser,
  Fingerprint,
  Focus,
  ImagePlus,
  Images,
  Maximize2,
  PencilLine,
  ScanLine,
  Send,
  Shirt,
  SquareDashed,
  UserRound,
  Video,
  WandSparkles,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import {
  SEND_INLINE_LIMIT,
  sendActionCount,
  sendFamilyLabels,
  sendRowsFor,
  type SendActionId,
  type SendFamily
} from "@/lib/asset-send";
import type { Flux3ImageGalleryTarget } from "@/lib/dashboard/flux3-image-inbox";
import { referenceDropTargets } from "@/lib/reference-roles";
import type { AssetRecord, ImageWorkspaceMode, ReferenceRole } from "@/lib/types";

export type AssetSendHandlers = {
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageWorkspaceMode) => void;
  onSendToVtoGarment: (asset: AssetRecord) => void;
  onSendToFlux3Keyframe?: (asset: AssetRecord) => void;
  /** FLUX 3 Image: the edit source, the next free reference slot, or the next box without a reference. */
  onSendToFlux3Image?: (asset: AssetRecord, target: Flux3ImageGalleryTarget) => void;
  onSendToFlux3Continue?: (asset: AssetRecord) => void;
  onSendToEdit?: (asset: AssetRecord) => void;
  onSendToUpscale?: (asset: AssetRecord) => void;
  onSendToReference: (asset: AssetRecord, role?: ReferenceRole, targetId?: string) => void;
};

type AssetSendActionsProps = AssetSendHandlers & {
  asset: AssetRecord;
  /** The family the gallery leads every card with. */
  family: SendFamily;
};

type SendAction = {
  icon: LucideIcon;
  title: string;
  /** Undefined when the page gave no handler, so the button is left out. */
  run?: (asset: AssetRecord) => void;
};

/** Each button's icon, tooltip and handler. FLUX 3 Image keeps its workspace tab's wand. */
function sendActions(props: AssetSendActionsProps): Record<SendActionId, SendAction> {
  const flux3Image = (target: Flux3ImageGalleryTarget) =>
    props.onSendToFlux3Image ? (asset: AssetRecord) => props.onSendToFlux3Image?.(asset, target) : undefined;
  const tool = (mode: ImageWorkspaceMode) => (asset: AssetRecord) => props.onSendToWorkspace(asset, mode);
  return {
    "flux3-video-prompt": { icon: Send, title: "Send prompt to FLUX 3 video", run: props.onSendToPrompt },
    "flux3-continue": { icon: Video, title: "Continue this video in FLUX 3", run: props.onSendToFlux3Continue },
    "flux3-keyframe": { icon: Clapperboard, title: "Add as next FLUX 3 video keyframe", run: props.onSendToFlux3Keyframe },
    "flux3-image-source": { icon: WandSparkles, title: "Edit in FLUX 3 Image", run: flux3Image("source") },
    "flux3-image-reference": { icon: Images, title: "Add as next FLUX 3 Image reference", run: flux3Image("reference") },
    "flux3-image-box": { icon: SquareDashed, title: "Use as the reference for the next FLUX 3 Image box", run: flux3Image("box") },
    "flux2-prompt": { icon: Send, title: "Send prompt to FLUX.2", run: props.onSendToPrompt },
    "flux2-reference": { icon: ImagePlus, title: "Add as FLUX.2 image reference", run: (asset) => props.onSendToReference(asset) },
    erase: { icon: Eraser, title: "Send to Erase", run: tool("erase") },
    "vto-person": { icon: UserRound, title: "Use as VTO person", run: tool("vto") },
    "vto-garment": { icon: Shirt, title: "Add as next VTO garment", run: props.onSendToVtoGarment },
    outpaint: { icon: Maximize2, title: "Send to Outpaint", run: tool("outpaint") },
    deblur: { icon: Focus, title: "Send to Deblur", run: tool("deblur") },
    glyphs: { icon: Fingerprint, title: "Send to Glyphs", run: tool("glyphs") },
    "video-edit": { icon: PencilLine, title: "Send to Video Edit", run: props.onSendToEdit },
    "video-upscale": { icon: ScanLine, title: "Send to Video Upscale", run: props.onSendToUpscale }
  };
}

/**
 * A gallery card's send buttons, one labelled row per product family. The
 * gallery's chosen family shows and the chevron opens the rest on this card;
 * a card with only a few buttons, such as a video, shows them all on one line.
 */
export function AssetSendActions(props: AssetSendActionsProps) {
  const { asset } = props;
  const [expanded, setExpanded] = useState(false);
  const actions = sendActions(props);
  const rows = sendRowsFor(asset.mediaType === "video", props.family, (id) => Boolean(actions[id].run));
  const addImageTarget = referenceDropTargets.find((target) => target.id === "add-image") || referenceDropTargets[0];
  if (!rows.length) return null;
  const inline = sendActionCount(rows) <= SEND_INLINE_LIMIT;
  const others = inline ? [] : rows.slice(1).map((row) => sendFamilyLabels[row.family].label);

  function button(id: SendActionId) {
    const { icon: Icon, title, run } = actions[id];
    if (id !== "flux2-reference") {
      return (
        <button type="button" key={id} onClick={() => run?.(asset)} title={title}>
          <Icon size={15} />
        </button>
      );
    }
    // FLUX.2 references have roles; hovering the button offers them.
    return (
      <div className="assetReferenceAction" key={id}>
        <button type="button" onClick={() => props.onSendToReference(asset, addImageTarget.role, addImageTarget.id)} title={title}>
          <Icon size={15} />
        </button>
        <div className="assetReferenceMenu" aria-label="Use as reference">
          {referenceDropTargets.map((target) => (
            <button
              type="button"
              key={target.id}
              onClick={() => props.onSendToReference(asset, target.role, target.id)}
              title={`Use as ${target.label} reference`}
            >
              {target.shortLabel}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={inline ? "assetSend inline" : "assetSend"}>
      {rows.slice(0, expanded || inline ? rows.length : 1).map((row, index) => (
        <div className={`assetSendRow assetSendRow-${row.family}`} key={row.family}>
          <span className="assetSendFamily" title={sendFamilyLabels[row.family].title}>
            {sendFamilyLabels[row.family].label}
          </span>
          {row.groups.map((group) => (
            <span className="assetSendGroup" key={group.caption ?? row.family}>
              {group.caption && <em>{group.caption}</em>}
              {group.actions.map(button)}
            </span>
          ))}
          {index === 0 && others.length > 0 && (
            <button
              type="button"
              className={expanded ? "assetSendMore open" : "assetSendMore"}
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              title={expanded ? `Hide ${others.join(" and ")}` : `Show ${others.join(" and ")}`}
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
