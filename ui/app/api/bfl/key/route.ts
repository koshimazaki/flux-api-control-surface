import { NextRequest, NextResponse } from "next/server";
import { apiKeyStatus, deleteMacOsKeychainApiKey, writeMacOsKeychainApiKey } from "@/lib/server-api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  return NextResponse.json(await apiKeyStatus());
}

export async function POST(request: NextRequest) {
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  try {
    await writeMacOsKeychainApiKey(body.apiKey);
    return NextResponse.json({
      ...(await apiKeyStatus()),
      saved: true
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save API key", 500);
  }
}

export async function DELETE() {
  try {
    const deleted = await deleteMacOsKeychainApiKey();
    return NextResponse.json({
      ...(await apiKeyStatus()),
      deleted
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not remove API key", 500);
  }
}
