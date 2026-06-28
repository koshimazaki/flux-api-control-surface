import { NextResponse, type NextRequest } from "next/server";

// Local-only hardening for the FLUX control surface.
// The dashboard's API routes can spend FLUX credits and read/write the macOS
// Keychain, so every /api request must satisfy two checks:
//   1. Host must be a loopback name — defeats DNS-rebinding, where a malicious
//      site re-points its hostname at 127.0.0.1 but the browser still sends its
//      own Host header.
//   2. State-changing requests carrying a cross-site Origin are rejected —
//      defeats browser CSRF (a visited page firing a no-preflight "simple"
//      POST at localhost). Server-to-server callers (the MCP bridge, curl,
//      local agents) send no Origin and are unaffected.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostnameOf(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // IPv6 literal form, e.g. "[::1]:3000"
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > 0 ? trimmed.slice(1, end).toLowerCase() : null;
  }
  return trimmed.split(":")[0].toLowerCase();
}

export function middleware(request: NextRequest) {
  const host = hostnameOf(request.headers.get("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    return NextResponse.json({ error: "Forbidden: non-local host." }, { status: 403 });
  }

  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
      } catch {
        originHost = null;
      }
      if (!originHost || !LOOPBACK_HOSTS.has(originHost)) {
        return NextResponse.json({ error: "Forbidden: cross-origin request." }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};
