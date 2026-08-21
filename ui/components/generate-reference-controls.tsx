import { Database, ImagePlus, Images, Mountain, Move, Palette, UserRound, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { IconButton } from "@/components/ui/icon-button";
import {
  type ReferenceDropTarget,
  referenceDisplayName,
  referenceDropTargets,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceToken
} from "@/lib/reference-roles";
import {
  BFL_IMAGE_OPTION_MIME,
  BFL_REFERENCE_MIME,
  parseReferenceDragPayload,
  setReferenceDragData
} from "@/lib/reference-drag";
import type { ReferenceImage, ReferenceRole } from "@/lib/types";

const REFERENCE_WEIGHT_STEPS = [
  { label: "Hint", value: 0 },
  { label: "Blend", value: 50 },
  { label: "Strong", value: 80 },
  { label: "Anchor", value: 100 }
];

const roleIcons: Record<ReferenceRole, typeof UserRound> = {
  character: UserRound,
  style: Palette,
  environment: Mountain,
  pose: Move,
  loose: Images
};

type GenerateReferenceControlsProps = {
  references: ReferenceImage[];
  maxReferences: number;
  primaryReferenceUrl: string;
  primaryReferencePreview?: string;
  referenceWeight: number;
  referenceCue: string;
  normalizeReferences: boolean;
  onReferencesChange: (value: ReferenceImage[]) => void;
  onPrimaryReferenceUrlChange: (value: string) => void;
  onPrimaryReferenceFiles: (files: File[], role?: ReferenceRole) => void;
  onClearPrimaryReference: () => void;
  onReferenceWeightChange: (value: number) => void;
  onReferenceCueChange: (value: string) => void;
  onNormalizeReferencesChange: (value: boolean) => void;
  onReferenceFiles: (files: File[], role?: ReferenceRole, targetId?: string) => void;
  onReferenceDropPayload: (payload: string, role?: ReferenceRole, targetId?: string) => void;
};

export function GenerateReferenceControls(props: GenerateReferenceControlsProps) {
  const [dragTargetId, setDragTargetId] = useState("");
  const activeReferenceCount = props.references.filter((reference) => Boolean(reference.value)).length;
  const referencesWithIndex = props.references.map((reference, index) => ({ reference, index }));
  const targetReferences = new Map<string, typeof referencesWithIndex>();
  const seenLegacyTargetsByRole = new Map<ReferenceRole, number>();
  const referenceWeightIndex = REFERENCE_WEIGHT_STEPS.reduce(
    (nearest, step, index) =>
      Math.abs(step.value - props.referenceWeight) <
      Math.abs(REFERENCE_WEIGHT_STEPS[nearest].value - props.referenceWeight)
        ? index
        : nearest,
    0
  );
  const referenceWeightLabel = REFERENCE_WEIGHT_STEPS[referenceWeightIndex].label;

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

  function updateReference(id: string, patch: Partial<ReferenceImage>) {
    props.onReferencesChange(
      props.references.map((reference) => (reference.id === id ? { ...reference, ...patch } : reference))
    );
  }

  function removeReference(id: string) {
    props.onReferencesChange(props.references.filter((reference) => reference.id !== id));
  }

  function updateReferenceTarget(id: string, target: ReferenceDropTarget) {
    props.onReferencesChange(
      props.references.map((reference) =>
        reference.id === id ? { ...reference, role: target.role, targetId: target.id } : reference
      )
    );
  }

  function referenceDragClass(targetId: string, hasReferences: boolean) {
    return ["referenceRoleDrop", hasReferences ? "active" : "", dragTargetId === targetId ? "dragOver" : ""]
      .filter(Boolean)
      .join(" ");
  }

  function handleReferenceDragOver(event: ReactDragEvent, targetId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dragTargetId !== targetId) setDragTargetId(targetId);
  }

  function handleReferenceDragLeave(event: ReactDragEvent, targetId: string) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragTargetId((current) => (current === targetId ? "" : current));
  }

  function handleReferenceDrop(event: ReactDragEvent, target?: ReferenceDropTarget) {
    event.preventDefault();
    setDragTargetId("");
    const referencePayload = event.dataTransfer.getData(BFL_REFERENCE_MIME);
    if (referencePayload && target) {
      const draggedReference = parseReferenceDragPayload(referencePayload);
      if (draggedReference?.id && props.references.some((reference) => reference.id === draggedReference.id)) {
        updateReferenceTarget(draggedReference.id, target);
        return;
      }
    }
    const payload =
      event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      props.onReferenceDropPayload(payload, target?.role, target?.id);
      return;
    }
    props.onReferenceFiles(
      Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")),
      target?.role,
      target?.id
    );
  }

  return (
    <section className="generateReferenceControls" aria-label="Generate references">
      <div className="referenceHeader generateReferenceHeader">
        <div>
          <strong>References</strong>
          <span>{activeReferenceCount}/{props.maxReferences} connected to this prompt</span>
        </div>
        {(props.primaryReferencePreview || props.primaryReferenceUrl) && (
          <IconButton title="Clear primary reference" onClick={props.onClearPrimaryReference}>
            <X size={14} />
          </IconButton>
        )}
      </div>

      <div className="referenceRoleGrid generateReferenceRoleGrid">
        {referenceDropTargets.map((target) => {
          const role = referenceRoleConfig(target.role);
          const references = targetReferences.get(target.id) || [];
          const RoleIcon = roleIcons[target.role];
          return (
            <div
              className={referenceDragClass(target.id, Boolean(references.length))}
              key={target.id}
              onDragOver={(event) => handleReferenceDragOver(event, target.id)}
              onDragLeave={(event) => handleReferenceDragLeave(event, target.id)}
              onDrop={(event) => handleReferenceDrop(event, target)}
              title={role.cue}
            >
              <div className="referenceRoleTitle">
                <span>
                  <RoleIcon size={14} />
                  <strong>{target.label}</strong>
                </span>
              </div>
              <div className="referenceRoleMeta">
                <small>{target.hint}</small>
                <code>{target.token}</code>
              </div>
              <div className={references.length ? "referenceRoleThumbs" : "referenceRoleThumbs empty"}>
                {references.length ? (
                  references.slice(0, 4).map(({ reference, index }) => {
                    const preview = referencePreviewSrc(reference);
                    return (
                      <div className="referenceRoleThumb" key={reference.id}>
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview}
                            alt={referenceDisplayName(reference, index)}
                            draggable
                            onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
                          />
                        ) : (
                          <span
                            draggable
                            onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
                          >
                            {referenceToken(index)}
                          </span>
                        )}
                        <button
                          type="button"
                          className="referenceThumbRemove"
                          title={`Remove ${referenceToken(index)}`}
                          onClick={() => removeReference(reference.id)}
                        >
                          <X size={12} />
                        </button>
                        <em>{referenceToken(index)}</em>
                      </div>
                    );
                  })
                ) : (
                  <span className="referenceRoleEmpty">{target.emptyLabel}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="generateReferenceUtilityRow">
        <div
          className={dragTargetId === "all" ? "referenceDropzone dragOver" : "referenceDropzone"}
          onDragOver={(event) => handleReferenceDragOver(event, "all")}
          onDragLeave={(event) => handleReferenceDragLeave(event, "all")}
          onDrop={(event) => handleReferenceDrop(event)}
        >
          <Database size={15} />
          <span>Drop cards or image files</span>
        </div>

        <div
          className="referenceUrlBar"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragTargetId("");
            props.onPrimaryReferenceFiles(
              Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"))
            );
          }}
        >
          {props.primaryReferencePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.primaryReferencePreview}
              alt="Primary reference"
              draggable={Boolean(props.references[0])}
              onDragStart={(event) =>
                props.references[0] && setReferenceDragData(event.dataTransfer, props.references[0], 0)
              }
            />
          ) : (
            <ImagePlus size={16} />
          )}
          <input
            value={props.primaryReferenceUrl}
            onChange={(event) => props.onPrimaryReferenceUrlChange(event.target.value)}
            placeholder="Reference image URL"
          />
          {props.references[0] && (
            <button
              type="button"
              className="referenceUrlClear"
              title="Remove primary reference"
              onClick={props.onClearPrimaryReference}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <details className="generateReferenceAdvanced">
        <summary>
          <span>Reference shaping</span>
          <strong>{referenceWeightLabel} · {props.referenceWeight}</strong>
        </summary>
        <div className="generateReferenceAdvancedBody">
          <div className="referenceWeightControl">
            <input
              type="range"
              min={0}
              max={REFERENCE_WEIGHT_STEPS.length - 1}
              step={1}
              value={referenceWeightIndex}
              aria-label="Reference influence"
              onChange={(event) =>
                props.onReferenceWeightChange(REFERENCE_WEIGHT_STEPS[Number(event.currentTarget.value)].value)
              }
            />
            <div className="referenceWeightTicks">
              {REFERENCE_WEIGHT_STEPS.map((step) => (
                <button
                  type="button"
                  key={step.label}
                  className={step.value === props.referenceWeight ? "active" : ""}
                  onClick={() => props.onReferenceWeightChange(step.value)}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          <div className="referenceList">
            {props.references.slice(1).map((reference, index) => {
              const slotIndex = index + 1;
              const role = referenceRoleConfig(reference.role, slotIndex);
              const preview = referencePreviewSrc(reference);
              return (
                <div className="referenceItem" key={reference.id}>
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt={referenceDisplayName(reference, slotIndex)}
                      draggable
                      onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, slotIndex)}
                    />
                  ) : (
                    <div
                      className="referenceIndex"
                      draggable
                      onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, slotIndex)}
                    >
                      {slotIndex + 1}
                    </div>
                  )}
                  <div className="referenceItemMeta">
                    <strong>{referenceToken(slotIndex)}</strong>
                    <span>{role.label}</span>
                  </div>
                  <input
                    value={reference.value}
                    placeholder={`Image ${slotIndex + 1} URL or data URL`}
                    onChange={(event) => updateReference(reference.id, { value: event.target.value })}
                  />
                  <button type="button" title="Remove reference" onClick={() => removeReference(reference.id)}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <label className="referenceCueField">
            Submission cue
            <textarea
              className="referenceCue"
              value={props.referenceCue}
              onChange={(event) => props.onReferenceCueChange(event.target.value)}
            />
          </label>
          <label
            className="toggle referenceSnapToggle"
            title="Crop to the nearest standard aspect, resize to 1280px, strip metadata, and submit a clean RGB reference image to BFL."
          >
            <input
              type="checkbox"
              checked={props.normalizeReferences}
              onChange={(event) => props.onNormalizeReferencesChange(event.target.checked)}
            />
            <span>Snap refs to 1280</span>
          </label>
        </div>
      </details>
    </section>
  );
}
