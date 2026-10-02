import {
  BookmarkPlus,
  Check,
  Clipboard,
  Download,
  Expand,
  Film,
  FolderSearch,
  Heart,
  ImageOff,
  ImagePlus,
  Info,
  PackagePlus,
  Play,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssetSendActions, type AssetSendHandlers } from "@/components/asset-send-actions";
import { AssetRoleBadge, assetRoleClassName } from "@/components/ui/asset-role-badge";
import type { SendFamily } from "@/lib/asset-send";
import { copyText } from "@/lib/clipboard";
import { glyphPreviewBackgroundForAsset, glyphPreviewClassName } from "@/lib/glyph-svg";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import { referencePreviewSrc } from "@/lib/reference-roles";
import { useHoverPreview } from "@/lib/use-hover-preview";
import type { AssetBadge, AssetRecord, AspectRatio, ReferenceImage } from "@/lib/types";

// Broken legacy pointers should fail once per browser session, not every time
// the Assets tab remounts or a card re-enters the viewport.
const unavailableMediaSources = new Set<string>();

type AssetCardProps = AssetSendHandlers & {
  asset: AssetRecord;
  aspectRatio: AspectRatio;
  badges: AssetBadge[];
  isSelected: boolean;
  metadataOpen: boolean;
  /** The product family whose send buttons every card leads with. */
  sendFamily: SendFamily;
  onToggleSelected: (id: string) => void;
  onToggleMetadata: (id: string) => void;
  onOpen: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
  onRevealAsset?: (asset: AssetRecord) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onSavePromptToLibrary: (asset: AssetRecord) => void;
};

/**
 * Reserves the card's picture box before the media arrives.
 *
 * On a fixed ratio the grid is already stable. On "free" the box used to have
 * no height until the image or video loaded, so every card resized as it came
 * in and the library jumped. The asset's own dimensions are used when it
 * records them, the measured ones once the media reports them, and 16/9 in the
 * meantime — so a card is never zero-height and settles at most once.
 */
function getAspectStyle(ratio: AspectRatio, measured?: { width: number; height: number } | null, asset?: AssetRecord) {
  if (ratio !== "free") return { aspectRatio: ratio.replace(":", "/") };
  const known = measured || (asset?.width && asset?.height ? { width: asset.width, height: asset.height } : null);
  return { aspectRatio: known ? `${known.width} / ${known.height}` : "16 / 9" };
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
  const asset = props.asset;
  const isVideo = asset.mediaType === "video";
  const mediaSource = asset.videoUrl || asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  const [mediaFailed, setMediaFailed] = useState(
    () => !mediaSource || unavailableMediaSources.has(mediaSource)
  );
  // The media's real shape, once it reports it, so the reserved box settles to
  // the truth instead of every card resizing as its picture arrives.
  const [measuredRatio, setMeasuredRatio] = useState<{ width: number; height: number } | null>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const hoverPreview = useHoverPreview();
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
        style={getAspectStyle(props.aspectRatio, measuredRatio, asset)}
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
              className={mediaLoaded ? "assetMediaReady" : undefined}
              {...hoverPreview}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (video.videoWidth && video.videoHeight) {
                  setMeasuredRatio({ width: video.videoWidth, height: video.videoHeight });
                }
                setMediaLoaded(true);
              }}
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
            className={mediaLoaded ? "assetMediaReady" : undefined}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setMeasuredRatio({ width: image.naturalWidth, height: image.naturalHeight });
              }
              setMediaLoaded(true);
            }}
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
        <AssetSendActions
          asset={asset}
          family={props.sendFamily}
          onSendToPrompt={props.onSendToPrompt}
          onSendToWorkspace={props.onSendToWorkspace}
          onSendToVtoGarment={props.onSendToVtoGarment}
          onSendToFlux3Keyframe={props.onSendToFlux3Keyframe}
          onSendToFlux3Image={props.onSendToFlux3Image}
          onSendToFlux3Continue={props.onSendToFlux3Continue}
          onSendToEdit={props.onSendToEdit}
          onSendToUpscale={props.onSendToUpscale}
          onSendToReference={props.onSendToReference}
        />
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
