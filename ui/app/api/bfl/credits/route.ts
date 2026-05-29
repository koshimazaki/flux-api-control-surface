import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = "https://api.bfl.ai/v1";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const apiKey = body.apiKey?.trim() || process.env.BFL_API_KEY?.trim() || process.env.FLUX_API_KEY?.trim();
  if (!apiKey) return jsonError("BFL API key is required");

  const response = await fetch(`${API_BASE}/credits`, {
    headers: {
      accept: "application/json",
      "x-key": apiKey
    },
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: "Could not fetch BFL credits", details: data }, { status: response.status });
  }

  return NextResponse.json(data);
}
