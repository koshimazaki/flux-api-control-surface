import { referenceRoleForIndex } from "@/lib/reference-roles";
import type { ReferenceImage, ReferenceRole } from "@/lib/types";

type ReferenceDestination = { role?: ReferenceRole; id?: string };

// Match the role cards' placement of references saved before targetId existed.
export function referenceAssignmentTarget(references: ReferenceImage[], index: number): string {
  const reference = references[index];
  if (reference.targetId) return reference.targetId;
  const role = reference.role || referenceRoleForIndex(index);
  if (role === "style") {
    const occurrence = references.slice(0, index + 1).filter((item, i) =>
      item.value && !item.targetId && (item.role || referenceRoleForIndex(i)) === "style"
    ).length;
    return `style-${occurrence}`;
  }
  return role === "loose" ? "add-image" : role;
}

// References are assignments, not unique source images. Copy to a new role,
// reuse an existing assignment in the same role, and never replace its siblings.
export function addReferenceAssignments(
  current: ReferenceImage[],
  sources: ReferenceImage[],
  limit: number,
  destination?: ReferenceDestination
) {
  const references = [...current];
  const slots: number[] = [];
  let limited = false;
  for (const source of sources) {
    const existingIndex = references.findIndex((reference, index) => {
      const sameImage = (source.assetId && source.assetId === reference.assetId)
        || (source.value && source.value === reference.value);
      if (!sameImage) return false;
      if (destination?.id) return referenceAssignmentTarget(references, index) === destination.id;
      if (destination?.role) return (reference.role || referenceRoleForIndex(index)) === destination.role;
      return true;
    });
    if (existingIndex >= 0) {
      slots.push(existingIndex + 1);
      continue;
    }
    if (references.length >= limit) {
      limited = true;
      continue;
    }
    references.push({
      ...source,
      id: `ref-${crypto.randomUUID()}`,
      role: destination?.role || source.role || referenceRoleForIndex(references.length),
      targetId: destination?.id || source.targetId
    });
    slots.push(references.length);
  }
  return { references, slots, limited };
}
