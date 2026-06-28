import { referenceDisplayName } from "@/lib/reference-roles";
import type { ReferenceImage } from "@/lib/types";

export const BFL_IMAGE_OPTION_MIME = "application/x-bfl-image-option";
export const BFL_REFERENCE_MIME = "application/x-bfl-reference";

export type ReferenceDragPayload = {
  id?: string;
  index?: number;
  name?: string;
  value?: string;
  targetId?: string;
  assetId?: string;
};

export function setReferenceDragData(dataTransfer: DataTransfer, reference: ReferenceImage, index: number) {
  if (reference.assetId) {
    dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${reference.assetId}`);
    dataTransfer.setData("text/plain", `asset:${reference.assetId}`);
  }
  dataTransfer.setData(
    BFL_REFERENCE_MIME,
    JSON.stringify({
      id: reference.id,
      index,
      name: referenceDisplayName(reference, index),
      value: reference.value,
      targetId: reference.targetId,
      assetId: reference.assetId
    })
  );
  dataTransfer.effectAllowed = "copy";
}

export function parseReferenceDragPayload(payload: string): ReferenceDragPayload | null {
  try {
    const parsed = JSON.parse(payload) as ReferenceDragPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
