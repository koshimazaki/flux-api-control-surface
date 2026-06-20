import { NextRequest, NextResponse } from "next/server";
import { apiKeyStatus, deleteMacOsKeychainApiKey, writeMacOsKeychainApiKey } from "@/lib/server-api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHostname(value: string) {
  return LOCAL_HOSTS.has(value.replace(/^\[|\]$/g, ""));
}

// Key write/delete must only be reachable from the local app itself: reject
// non-localhost hosts and cross-origin requests so a stray browser tab can't
// silently swap or delete your stored key (CSRF), and so this never becomes a
// remotely reachable secret store if the dashboard is ever exposed.
function rejectNonLocal(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const host = (request.headers.get("host") ?? requestUrl.hostname).replace(/:\d+$/, "");
  if (!isLocalHostname(host)) {
    return jsonError("This endpoint is only available on localhost.", 403);
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return jsonError("Invalid origin.", 403);
    }
    if (!isLocalHostname(originUrl.hostname) || originUrl.origin !== requestUrl.origin) {
      return jsonError("Cross-origin requests are not allowed.", 403);
    }
  }
  return null;
}

export async function GET() {
  return NextResponse.json(await apiKeyStatus());
}

export async function POST(request: NextRequest) {
  const notLocal = rejectNonLocal(request);
  if (notLocal) return notLocal;

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

export async function DELETE(request: NextRequest) {
  const notLocal = rejectNonLocal(request);
  if (notLocal) return notLocal;

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
