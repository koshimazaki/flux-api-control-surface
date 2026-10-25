import type { DragEvent as ReactDragEvent } from "react";
import { BFL_IMAGE_OPTION_MIME, BFL_REFERENCE_MIME } from "@/lib/reference-drag";

/** Image files in a drop, in drop order. */
export function imageFilesFromTransfer(event: ReactDragEvent) {
  return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
}

/** An asset or reference payload dragged from inside the dashboard, if any. */
export function dragPayloadFromTransfer(event: ReactDragEvent) {
  return (
    event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
    event.dataTransfer.getData(BFL_REFERENCE_MIME) ||
    event.dataTransfer.getData("text/plain")
  );
}

/** True while dragging something a source-image workspace can accept. */
export function isSourceDrag(event: ReactDragEvent) {
  const types = Array.from(event.dataTransfer.types);
  return types.includes(BFL_IMAGE_OPTION_MIME) || types.includes(BFL_REFERENCE_MIME) || types.includes("Files");
}
