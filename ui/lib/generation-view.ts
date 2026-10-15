import type { GenerationQueueJob } from "@/lib/generation-queue";

const PENDING = new Set(["queued", "waiting", "paused", "submitting", "running", "downloading"]);

/** The server queue drives every waiting view, including jobs started outside the browser. */
export function pendingGenerationJobs(jobs: GenerationQueueJob[]) {
  return jobs.filter((job) => PENDING.has(job.status));
}

export function generationJobMatchesWorkspace(job: GenerationQueueJob, workspace: string) {
  if (workspace === "flux3_image") return job.kind === "image" && job.operation === "flux3-image";
  if (workspace === "prompt") return job.kind === "image" && job.operation !== "flux3-image";
  if (workspace === "edit") return job.kind === "video" && job.operation === "video-edit";
  if (workspace === "upscale") return job.kind === "video" && job.operation === "video-upscale";
  if (workspace === "flux3") return job.kind === "video" && !["video-edit", "video-upscale"].includes(job.operation);
  return job.kind === "tool" && job.operation === workspace;
}
