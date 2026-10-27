import { notFound } from "next/navigation";
import { GalleryFeedbackPreview } from "@/components/generation/gallery-feedback-preview";

export default function GalleryPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GalleryFeedbackPreview />;
}
