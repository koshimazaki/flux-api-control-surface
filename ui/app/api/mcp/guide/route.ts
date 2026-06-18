import { NextResponse } from "next/server";
import { agentWorkflowGuide } from "@/lib/agent-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(agentWorkflowGuide);
}
