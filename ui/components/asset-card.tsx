import {
  BookmarkPlus,
  Check,
  Clipboard,
  Download,
  Eraser,
  Expand,
  Clapperboard,
  Film,
  Fingerprint,
  FolderSearch,
  Focus,
  Heart,
  ImageOff,
  ImagePlus,
  Info,
  Maximize2,
  PackagePlus,
  Play,
  Send,
  Shirt,
  Sparkles,
  Trash2,
  Upload,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssetRoleBadge, assetRoleClassName } from "@/components/ui/asset-role-badge";
import { copyText } from "@/lib/clipboard";
import { glyphPreviewBackgroundForAsset, glyphPreviewClassName } from "@/lib/glyph-svg";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import { referenceDropTargets, referencePreviewSrc } from "@/lib/reference-roles";
import type { AssetBadge, AssetRecord, AspectRatio, ImageWorkspaceMode, ReferenceImage, ReferenceRole } from "@/lib/types";

type ImageToolMode = ImageWorkspaceMode;

// Broken legacy pointers should fail once per browser session, not every time
// the Assets tab remounts or a card re-enters the viewport.
const unavailableMediaSources = new Set<string>();

type AssetCardProps = {
  asset: AssetRecord;
  aspectRatio: AspectRatio;
  badges: AssetBadge[];
  isSelected: boolean;
  metadataOpen: boolean;
  onToggleSelected: (id: string) => void;
  onToggleMetadata: (id: string) => void;
  onOpen: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
  onRevealAsset?: (asset: AssetRecord) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageToolMode) => void;
  onSendToVtoGarment: (asset: AssetRecord) => void;
  onSendToFlux3Keyframe?: (asset: AssetRecord) => void;
  onSendToReference: (asset: AssetRecord, role?: ReferenceRole, targetId?: string) => void;
  onSavePromptToLibrary: (asset: AssetRecord) => void;
};

function getAspectStyle(ratio: AspectRatio) {
  return ratio === "free" ? undefined : { aspectRatio: ratio.replace(":", "/") };
}

function isFluxAsset(asset: AssetRecord) {
  return /bfl|flux/i.test(`${asset.provider || ""} ${asset.model || ""}`);
}

function assetOrigin(asset: AssetRecord) {
  if (isFluxAsset(asset)) {
    return { label: "F", className: "flux", title: "FLUX output", icon: Sparkles };
  }
  if (asset.assetKind === "input") {
    return { label: "Input", className: "input", title: "Imported input image", icon: Upload };
  }
  if (asset.assetKind === "reference") {
    return { label: "Ref", className: "reference", title: "Reference image", icon: ImagePlus };
  }
  if (asset.assetKind === "asset") {
    return { label: "Asset", className: "asset", title: "Local asset", icon: PackagePlus };
  }
  return { label: "Output", className: "output", title: "Generated output", icon: Download };
}

function displayableReferences(references: ReferenceImage[] | undefined) {
  return (references ?? []).filter((reference) => Boolean(reference.value?.trim() || reference.assetId));
}

function referenceLabel(reference: ReferenceImage, index: number) {
  const name = reference.name?.trim();
  const clean = name && name !== "[stored reference omitted]" ? name : `reference ${index + 1}`;
  return reference.role ? `${reference.role}: ${clean}` : clean;
}

function referenceInitials(reference: ReferenceImage, index: number) {
  const name = reference.name?.trim();
  if (!name || name === "[stored reference omitted]") return `R${index + 1}`;
  return name.slice(0, 2).toUpperCase();
}

function ReferenceThumb({ reference, index }: { reference: ReferenceImage; index: number }) {
  const [failed, setFailed] = useState(false);
  const src = referencePreviewSrc(reference);
  const label = referenceLabel(reference, index);
  return (
    <span className="assetPromptRef" title={label}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="assetPromptRefFallback">{referenceInitials(reference, index)}</span>
      )}
      {reference.role ? <span className="assetPromptRefRole">{reference.role[0].toUpperCase()}</span> : null}
    </span>
  );
}

export function AssetCard(props: AssetCardProps) {
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addImageTarget = referenceDropTargets.find((target) => target.id === "add-image") || referenceDropTargets[0];
  const asset = props.asset;
  const isVideo = asset.mediaType === "video";
  const mediaSource = asset.videoUrl || asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  const [mediaFailed, setMediaFailed] = useState(
    () => !mediaSource || unavailableMediaSources.has(mediaSource)
  );
  const origin = assetOrigin(asset);
  const OriginIcon = origin.icon;
  const glyphPreviewBackground = glyphPreviewBackgroundForAsset(asset);
  const imageButtonClass = ["assetImageButton", isVideo ? "videoAssetPreview" : "", glyphPreviewBackground ? "glyphAssetPreview" : "", glyphPreviewClassName(glyphPreviewBackground)]
    .filter(Boolean)
    .join(" ");
  const cardClass = [
    "assetCard",
    props.isSelected ? "selectedAsset" : "",
    props.badges.length ? "referencedAsset" : "",
    assetRoleClassName(props.badges)
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  useEffect(() => {
    setMediaFailed(!mediaSource || unavailableMediaSources.has(mediaSource));
  }, [mediaSource]);

  function markMediaUnavailable() {
    if (mediaSource) unavailableMediaSources.add(mediaSource);
    setMediaFailed(true);
  }

  async function copyAssetPrompt() {
    if (!asset.prompt.trim()) return;
    const didCopy = await copyText(asset.prompt);
    if (!didCopy) return;
    setIsPromptCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setIsPromptCopied(false), 1000);
  }

  return (
    <article className={cardClass}>
      <button
        className="assetSelectButton"
        onClick={() => props.onToggleSelected(asset.id)}
        title={props.isSelected ? "Remove from collection selection" : "Select for collection"}
      >
        <PackagePlus size={15} />
      </button>
      {props.badges.length > 0 && (
        <div className="assetBadges">
          {props.badges.map((badge) => (
            <AssetRoleBadge badge={badge} key={`${badge.kind}-${badge.label}`} />
          ))}
        </div>
      )}
      <button
        className={imageButtonClass}
        onClick={() => props.onOpen(asset)}
        style={getAspectStyle(props.aspectRatio)}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${asset.id}`);
          event.dataTransfer.setData("text/plain", `asset:${asset.id}`);
          event.dataTransfer.effectAllowed = "copy";
        }}
        title={isVideo ? "Open video or drag it into FLUX 3 continuation" : "Drag onto a workspace canvas, the prompt editor, an audio timing row, or the reference dropzone"}
      >
        {mediaFailed ? (
          <span className="assetMediaUnavailable" role="img" aria-label="Image unavailable">
            <ImageOff size={22} />
            <span>Image unavailable</span>
          </span>
        ) : isVideo ? (
          <>
            <video
              src={mediaSource}
              muted
              playsInline
              preload="metadata"
              aria-label={asset.title || asset.id}
              onError={markMediaUnavailable}
            />
            <span className="assetVideoPlay" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSource}
            alt={asset.title || asset.id}
            loading="lazy"
            decoding="async"
            onError={markMediaUnavailable}
          />
        )}
        <span className={`assetOriginBadge assetOrigin-${origin.className}`} title={origin.title}>
          {isVideo ? <Film size={11} /> : <OriginIcon size={11} />}
          {origin.label}
        </span>
      </button>
      <div className="assetMeta">
        <strong>{asset.title || asset.id}</strong>
        <span>{asset.model}</span>
      </div>
      <p className="assetDate">
        {new Date(asset.timestamp).toLocaleTimeString()}
        {typeof asset.costCredits === "number" ? ` · ${asset.costCredits.toFixed(2)} cr` : ""}
      </p>
      {props.metadataOpen && (
        <pre>{JSON.stringify({
          seed: asset.seed,
          width: asset.width,
          height: asset.height,
          costCredits: asset.costCredits,
          creditsBefore: asset.creditsBefore,
          creditsAfter: asset.creditsAfter,
          creditDelta: asset.creditDelta,
          localImagePath: asset.localImagePath,
          localVideoPath: asset.localVideoPath,
          localPromptPath: asset.localPromptPath,
          localMetadataPath: asset.localMetadataPath,
          localSvgPath: asset.localSvgPath,
          remoteImageKey: asset.remoteImageKey,
          remotePromptKey: asset.remotePromptKey,
          remoteMetadataKey: asset.remoteMetadataKey,
          r2RootPrefix: asset.r2RootPrefix,
          references: asset.references,
          sourceAssetId: asset.sourceAssetId,
          operation: asset.operation,
          assetKind: asset.assetKind,
          inputMp: asset.inputMp,
          outputMp: asset.outputMp,
          runSettings: asset.runSettings,
          request: asset.payload
        }, null, 2)}</pre>
      )}
      <div className="assetPrompt">
        <button
          type="button"
          className={isPromptCopied ? "assetPromptCopy copied" : "assetPromptCopy"}
          onClick={() => void copyAssetPrompt()}
          title={isPromptCopied ? "Prompt copied" : "Copy full prompt"}
          disabled={!asset.prompt.trim()}
        >
          {isPromptCopied ? <Check size={13} /> : <Clipboard size={13} />}
        </button>
        <pre>{asset.prompt}</pre>
        {displayableReferences(asset.references).length > 0 && (
          <div className="assetPromptRefs">
            <span className="assetPromptRefsLabel">refs</span>
            {displayableReferences(asset.references).map((reference, index) => (
              <ReferenceThumb
                key={reference.id || `${asset.id}-ref-${index}`}
                reference={reference}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
      <div className="assetButtons">
        <div className="assetButtonGroup">
          <button onClick={() => props.onSendToPrompt(asset)} title="Send prompt to Generate">
            <Send size={15} />
          </button>
          {!isVideo && <div className="assetReferenceAction">
            <button
              onClick={() => props.onSendToReference(asset, addImageTarget.role, addImageTarget.id)}
              title="Add image reference"
            >
              <ImagePlus size={15} />
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
          </div>}
          {!isVideo && props.onSendToFlux3Keyframe && (
            <button onClick={() => props.onSendToFlux3Keyframe?.(asset)} title="Add as next FLUX 3 video keyframe">
              <Clapperboard size={15} />
            </button>
          )}
        </div>
        {!isVideo && <div className="assetButtonGroup">
          <button onClick={() => props.onSendToWorkspace(asset, "erase")} title="Send to Erase">
            <Eraser size={15} />
          </button>
          <button onClick={() => props.onSendToWorkspace(asset, "vto")} title="Use as VTO person">
            <UserRound size={15} />
          </button>
          <button onClick={() => props.onSendToVtoGarment(asset)} title="Add as next VTO garment">
            <Shirt size={15} />
          </button>
          <button onClick={() => props.onSendToWorkspace(asset, "outpaint")} title="Send to Outpaint">
            <Maximize2 size={15} />
          </button>
          <button onClick={() => props.onSendToWorkspace(asset, "deblur")} title="Send to Deblur">
            <Focus size={15} />
          </button>
          <button onClick={() => props.onSendToWorkspace(asset, "glyphs")} title="Send to Glyphs">
            <Fingerprint size={15} />
          </button>
        </div>}
        <div className="assetButtonGroup">
          <button
            onClick={() => props.onToggleSelected(asset.id)}
            className={props.isSelected ? "selected" : ""}
            title={props.isSelected ? "Remove from collection selection" : "Select for collection"}
          >
            <PackagePlus size={15} />
          </button>
          <button onClick={() => props.onToggleFavorite(asset.id)} className={asset.is_favorite ? "hearted" : ""} title="Favorite">
            <Heart size={15} fill={asset.is_favorite ? "currentColor" : "none"} />
          </button>
          <button onClick={() => props.onSavePromptToLibrary(asset)} title="Save prompt to library">
            <BookmarkPlus size={15} />
          </button>
          <button onClick={() => props.onToggleMetadata(asset.id)} title="Show metadata">
            <Info size={15} />
          </button>
          <button onClick={() => props.onOpen(asset)} title="Open">
            <Expand size={15} />
          </button>
          <button onClick={() => props.onDownload(asset)} title={`Download ${isVideo ? "video" : "image"}`}>
            <Download size={15} />
          </button>
          {props.onRevealAsset && (
            <button onClick={() => props.onRevealAsset?.(asset)} title="Show local file in Finder">
              <FolderSearch size={15} />
            </button>
          )}
          <button onClick={() => props.onDelete(asset.id)} title="Delete from browser library">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
