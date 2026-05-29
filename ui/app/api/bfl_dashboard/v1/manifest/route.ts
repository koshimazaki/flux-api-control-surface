import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "BFL Dashboard Agent API",
    version: "1.0.0",
    namespace: "/api/bfl_dashboard/v1",
    routes: [
      {
        method: "GET",
        path: "/api/bfl_dashboard/v1/manifest",
        purpose: "Describe stable dashboard routes intended for Codex and other local agents.",
        sideEffects: false
      },
      {
        method: "POST",
        path: "/api/bfl_dashboard/v1/caption_agent",
        purpose: "Prepare a LoRA collection captioning job folder and spawn Codex when the CLI is available.",
        sideEffects: true,
        body: {
          collection: {
            name: "string",
            triggerToken: "string",
            captionGuide: "string",
            items: "array of image data URLs with optional starting captions"
          },
          dryRun: "boolean"
        }
      }
    ],
    contracts: {
      collectionZip: "images/* plus captions/*.txt with matching filename stems",
      captionJob: "outputs/bfl-api-dashboard/caption-jobs/<timestamp>_<collection>/"
    }
  });
}
