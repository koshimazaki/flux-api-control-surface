import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Images,
  Mountain,
  Move,
  Palette,
  Shirt,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useState, type DragEvent as ReactDragEvent } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { assetImageSource } from "@/lib/dashboard-tools";
import { BFL_IMAGE_OPTION_MIME, BFL_REFERENCE_MIME, parseReferenceDragPayload, setReferenceDragData } from "@/lib/reference-drag";
import {
  referenceDisplayName,
  referenceDropTargets,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceToken,
  type ReferenceDropTarget
} from "@/lib/reference-roles";
import type { AssetRecord, ReferenceImage, ReferenceRole, WorkspaceMode } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

type MaybeAsync = Promise<unknown> | unknown;
type ReferenceWithIndex = { reference: ReferenceImage; index: number };

type ReferenceDockProps = {
  mode: WorkspaceMode;
  references: ReferenceImage[];
  maxReferences: number;
  sourceAsset: AssetRecord | null;
  vtoGarmentAssets: (AssetRecord | null)[];
  onReferencesChange: (value: ReferenceImage[]) => void;
  onReferenceDropPayload: (payload: string, role?: ReferenceRole, targetId?: string) => MaybeAsync;
  onReferenceFiles: (files: File[], role?: ReferenceRole, targetId?: string) => MaybeAsync;
  onSourceDropPayload: (payload: string) => MaybeAsync;
  onSourceFiles: (files: File[]) => MaybeAsync;
  onClearSource: () => void;
  onVtoGarmentDropPayload: (slotIndex: number, payload: string) => MaybeAsync;
  onVtoGarmentFiles: (slotIndex: number, files: File[]) => MaybeAsync;
  onClearVtoGarment: (slotIndex: number) => void;
};

const roleIcons: Record<ReferenceRole, LucideIcon> = {
  character: UserRound,
  style: Palette,
  environment: Mountain,
  pose: Move,
  loose: Images
};

function imageFilesFromTransfer(event: ReactDragEvent) {
  return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
}

function dragPayloadFromTransfer(event: ReactDragEvent) {
  return (
    event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
    event.dataTransfer.getData(BFL_REFERENCE_MIME) ||
    event.dataTransfer.getData("text/plain")
  );
}

function setAssetDragData(event: ReactDragEvent, asset: AssetRecord) {
  event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${asset.id}`);
  event.dataTransfer.setData("text/plain", `asset:${asset.id}`);
  event.dataTransfer.effectAllowed = "copy";
}

function slotDragClass(active: boolean, dragging: boolean) {
  return ["referenceDockSlot", active ? "active" : "", dragging ? "dragOver" : ""].filter(Boolean).join(" ");
}

function compactAssetTitle(asset: AssetRecord) {
  return asset.title || asset.id;
}

function isAsset(asset: AssetRecord | null): asset is AssetRecord {
  return Boolean(asset);
}

export function ReferenceDock({
  mode,
  references,
  maxReferences,
  sourceAsset,
  vtoGarmentAssets,
  onReferencesChange,
  onReferenceDropPayload,
  onReferenceFiles,
  onSourceDropPayload,
  onSourceFiles,
  onClearSource,
  onVtoGarmentDropPayload,
  onVtoGarmentFiles,
  onClearVtoGarment
}: ReferenceDockProps) {
  const dockMode = mode === "vto" ? "vto" : mode === "prompt" ? "prompt" : null;
  const [collapsed, setCollapsed] = useState(false);
  const [dragTarget, setDragTarget] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function shouldShowDock() {
      if (!dockMode) return false;
      const firstAsset = document.querySelector<HTMLElement>(".assetsPanel .assetCard");
      if (firstAsset) return firstAsset.getBoundingClientRect().bottom <= 96;

      const assetsPanel = document.querySelector<HTMLElement>(".assetsPanel");
      if (assetsPanel) return assetsPanel.getBoundingClientRect().top <= 96 && window.scrollY > 320;

      return false;
    }

    let frame = 0;
    const updateVisibility = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setIsVisible(shouldShowDock()));
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [dockMode]);

  if (!dockMode) return null;

  const activeReferences = references.filter((reference) => Boolean(reference.value));
  const garmentSlots = Array.from({ length: 4 }, (_, index) => vtoGarmentAssets[index] || null);
  const vtoFilledCount = Number(Boolean(sourceAsset)) + garmentSlots.filter(Boolean).length;
  const summary =
    dockMode === "prompt"
      ? `${activeReferences.length}/${maxReferences} refs`
      : `${sourceAsset ? "person" : "no person"} · ${garmentSlots.filter(Boolean).length}/4 garments`;
  const title = dockMode === "prompt" ? "Generate references" : "Virtual Try-On inputs";

  function handleDragOver(event: ReactDragEvent, targetId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dragTarget !== targetId) setDragTarget(targetId);
  }

  function handleDragLeave(event: ReactDragEvent, targetId: string) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragTarget((current) => (current === targetId ? "" : current));
  }

  function removeReference(id: string) {
    onReferencesChange(references.filter((reference) => reference.id !== id));
  }

  function updateReferenceTarget(id: string, target: ReferenceDropTarget) {
    onReferencesChange(
      references.map((reference) =>
        reference.id === id ? { ...reference, role: target.role, targetId: target.id } : reference
      )
    );
  }

  function handleReferenceDrop(event: ReactDragEvent, target: ReferenceDropTarget) {
    event.preventDefault();
    setDragTarget("");

    const referencePayload = event.dataTransfer.getData(BFL_REFERENCE_MIME);
    if (referencePayload) {
      const draggedReference = parseReferenceDragPayload(referencePayload);
      if (draggedReference?.id && references.some((reference) => reference.id === draggedReference.id)) {
        updateReferenceTarget(draggedReference.id, target);
        return;
      }
    }

    const payload = event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      void onReferenceDropPayload(payload, target.role, target.id);
      return;
    }

    const files = imageFilesFromTransfer(event);
    if (files.length) void onReferenceFiles(files, target.role, target.id);
  }

  function handleVtoSourceDrop(event: ReactDragEvent) {
    event.preventDefault();
    setDragTarget("");
    const payload = dragPayloadFromTransfer(event);
    if (payload) {
      void onSourceDropPayload(payload);
      return;
    }
    const files = imageFilesFromTransfer(event);
    if (files.length) void onSourceFiles(files);
  }

  function handleVtoGarmentDrop(event: ReactDragEvent, slotIndex: number) {
    event.preventDefault();
    setDragTarget("");
    const payload = dragPayloadFromTransfer(event);
    if (payload) {
      void onVtoGarmentDropPayload(slotIndex, payload);
      return;
    }
    const files = imageFilesFromTransfer(event);
    if (files.length) void onVtoGarmentFiles(slotIndex, files.slice(0, 1));
  }

  function generateReferenceGroups() {
    const referencesWithIndex = references.map((reference, index) => ({ reference, index }));
    const targetReferences = new Map<string, ReferenceWithIndex[]>();
    const seenLegacyTargetsByRole = new Map<ReferenceRole, number>();

    referenceDropTargets.forEach((target) => {
      const explicitReferences = referencesWithIndex.filter(
        ({ reference }) => Boolean(reference.value) && reference.targetId === target.id
      );
      const legacyRoleReferences = referencesWithIndex.filter(
        ({ reference, index }) =>
          Boolean(reference.value) &&
          !reference.targetId &&
          referenceRoleConfig(reference.role, index).id === target.role
      );
      const occurrence = seenLegacyTargetsByRole.get(target.role) || 0;
      seenLegacyTargetsByRole.set(target.role, occurrence + 1);
      const legacyReferences =
        target.role === "style" ? legacyRoleReferences.slice(occurrence, occurrence + 1) : legacyRoleReferences;
      targetReferences.set(target.id, [...explicitReferences, ...legacyReferences]);
    });

    return targetReferences;
  }

  function renderReferenceThumb(reference: ReferenceImage, index: number) {
    const preview = referencePreviewSrc(reference);
    return (
      <div
        className="referenceDockThumb"
        key={reference.id}
        draggable
        onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={referenceDisplayName(reference, index)} />
        ) : (
          <span>{referenceToken(index)}</span>
        )}
        <button type="button" title={`Remove ${referenceToken(index)}`} onClick={() => removeReference(reference.id)}>
          <X size={11} />
        </button>
        <em>{referenceToken(index)}</em>
      </div>
    );
  }

  function renderGenerateSlots() {
    const targetReferences = generateReferenceGroups();
    return referenceDropTargets.map((target) => {
      const role = referenceRoleConfig(target.role);
      const RoleIcon = roleIcons[target.role];
      const refs = targetReferences.get(target.id) || [];
      return (
        <div
          className={slotDragClass(Boolean(refs.length), dragTarget === target.id)}
          key={target.id}
          onDragOver={(event) => handleDragOver(event, target.id)}
          onDragLeave={(event) => handleDragLeave(event, target.id)}
          onDrop={(event) => handleReferenceDrop(event, target)}
          title={role.cue}
        >
          <div className="referenceDockSlotTop">
            <span>
              <RoleIcon size={14} />
              <strong>{target.label}</strong>
            </span>
            <code>{target.token}</code>
          </div>
          <div className={refs.length ? "referenceDockThumbs" : "referenceDockThumbs empty"}>
            {refs.length ? (
              <>
                {refs.slice(0, 3).map(({ reference, index }) => renderReferenceThumb(reference, index))}
                {refs.length > 3 && <span className="referenceDockMore">+{refs.length - 3}</span>}
              </>
            ) : (
              <span className="referenceDockEmpty">
                <ImagePlus size={14} />
                {target.emptyLabel}
              </span>
            )}
          </div>
        </div>
      );
    });
  }

  function renderAssetThumb(asset: AssetRecord, label: string, onClear: () => void) {
    return (
      <div
        className="referenceDockAssetThumb"
        draggable
        onDragStart={(event) => setAssetDragData(event, asset)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetImageSource(asset)} alt={compactAssetTitle(asset)} />
        <button type="button" title={`Clear ${label}`} onClick={onClear}>
          <X size={11} />
        </button>
        <em>{compactAssetTitle(asset)}</em>
      </div>
    );
  }

  function renderVtoSlots() {
    return (
      <>
        <div
          className={slotDragClass(Boolean(sourceAsset), dragTarget === "vto-source")}
          onDragOver={(event) => handleDragOver(event, "vto-source")}
          onDragLeave={(event) => handleDragLeave(event, "vto-source")}
          onDrop={handleVtoSourceDrop}
          title="Drop the person/source image for Virtual Try-On"
        >
          <div className="referenceDockSlotTop">
            <span>
              <UserRound size={14} />
              <strong>Person</strong>
            </span>
            <code>main</code>
          </div>
          <div className={sourceAsset ? "referenceDockThumbs" : "referenceDockThumbs empty"}>
            {sourceAsset ? (
              renderAssetThumb(sourceAsset, "person", onClearSource)
            ) : (
              <span className="referenceDockEmpty">
                <ImagePlus size={14} />
                Drop person
              </span>
            )}
          </div>
        </div>
        {garmentSlots.map((asset, index) => {
          const key = `vto-garment-${index}`;
          return (
            <div
              className={slotDragClass(Boolean(asset), dragTarget === key)}
              key={key}
              onDragOver={(event) => handleDragOver(event, key)}
              onDragLeave={(event) => handleDragLeave(event, key)}
              onDrop={(event) => handleVtoGarmentDrop(event, index)}
              title={`Drop garment ${index + 1}`}
            >
              <div className="referenceDockSlotTop">
                <span>
                  <Shirt size={14} />
                  <strong>Garment {index + 1}</strong>
                </span>
                <code>ref</code>
              </div>
              <div className={asset ? "referenceDockThumbs" : "referenceDockThumbs empty"}>
                {asset ? (
                  renderAssetThumb(asset, `garment ${index + 1}`, () => onClearVtoGarment(index))
                ) : (
                  <span className="referenceDockEmpty">
                    <ImagePlus size={14} />
                    Drop garment
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <section
      aria-hidden={!isVisible}
      className={["referenceDock", `mode-${dockMode}`, isVisible ? "visible" : "", collapsed ? "collapsed" : ""].join(" ")}
    >
      <div className="referenceDockHeader">
        <div>
          <span>
            <Sparkles size={14} />
            {title}
          </span>
          <strong>{summary}</strong>
        </div>
        <div className="referenceDockHeaderThumbs" aria-hidden="true">
          {dockMode === "prompt"
            ? activeReferences.slice(0, 5).map((reference, index) => {
                const preview = referencePreviewSrc(reference);
                return preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" key={reference.id} />
                ) : (
                  <span key={reference.id}>{index + 1}</span>
                );
              })
            : [sourceAsset, ...garmentSlots].filter(isAsset).slice(0, 5).map((asset) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetImageSource(asset)} alt="" key={asset.id} />
              ))}
          {dockMode === "prompt" && !activeReferences.length && <span>refs</span>}
          {dockMode === "vto" && !vtoFilledCount && <span>vto</span>}
        </div>
        <IconButton title={collapsed ? "Open reference dock" : "Collapse reference dock"} onClick={() => setCollapsed((open) => !open)}>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
      </div>
      {!collapsed && (
        <div className="referenceDockBody">
          <div className="referenceDockSlots">{dockMode === "prompt" ? renderGenerateSlots() : renderVtoSlots()}</div>
        </div>
      )}
    </section>
  );
}
