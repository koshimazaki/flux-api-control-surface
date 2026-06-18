import { NextResponse } from "next/server";
import { dashboardAgentRoutes, localAgentCoverage } from "@/lib/agent-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "FLUX API Control Surface Agent API",
    version: "1.0.0",
    namespace: "/api/bfl_dashboard/v1",
    routes: dashboardAgentRoutes,
    coverage: localAgentCoverage,
    contracts: {
      collectionZip: "images/* plus captions/*.txt with matching filename stems",
      captionJob: "outputs/flux-api-control-surface/caption-jobs/<timestamp>_<collection>/"
    }
  });
}
