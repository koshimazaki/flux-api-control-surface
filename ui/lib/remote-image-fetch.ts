import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";

export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_INPUT_PIXELS = 64_000_000;
const DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS = 10_000;

type RemoteImageFetchOptions = {
  allowedHosts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
};

function parseList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function allowedImageHosts() {
  return parseList(process.env.BFL_IMAGE_HOST_ALLOWLIST || process.env.BFL_ALLOWED_IMAGE_HOSTS);
}

function formatBytes(value: number) {
  return `${Math.ceil(value / (1024 * 1024))}MB`;
}

function hostMatchesPattern(hostname: string, pattern: string) {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
  }
  return hostname === pattern;
}

function isAllowedHost(hostname: string, allowedHosts: string[]) {
  return !allowedHosts.length || allowedHosts.some((pattern) => hostMatchesPattern(hostname, pattern));
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".lan") || lower.endsWith(".home")) {
    return true;
  }
  return lower === "metadata.google.internal" || (!lower.includes(".") && !net.isIP(lower));
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

// Expand an IPv6 literal (optionally carrying an embedded dotted-IPv4 tail or a
// %zone suffix) to its 16 bytes, or null if it cannot be parsed so callers can
// fail closed. net.isIP() has already validated the textual shape.
function ipv6ToBytes(address: string): Uint8Array | null {
  let addr = address.split("%")[0];
  // Fold an embedded dotted-IPv4 tail (e.g. ::ffff:127.0.0.1) into two hextets so
  // only hex groups remain to parse below.
  const dotted = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const quad = dotted[2].split(".").map(Number);
    if (quad.some((part) => part > 255)) return null;
    addr = `${dotted[1]}${((quad[0] << 8) | quad[1]).toString(16)}:${((quad[2] << 8) | quad[3]).toString(16)}`;
  }
  const sides = addr.split("::");
  if (sides.length > 2) return null;
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  const groups =
    sides.length === 2
      ? [...head, ...new Array(Math.max(8 - head.length - tail.length, 0)).fill("0"), ...tail]
      : head;
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[index])) return null;
    const value = Number.parseInt(groups[index], 16);
    bytes[index * 2] = (value >> 8) & 0xff;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

export function isBlockedRemoteAddress(address: string) {
  const normalized = address.toLowerCase();
  if (net.isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (net.isIP(normalized) !== 6) return true;

  const bytes = ipv6ToBytes(normalized);
  if (!bytes) return true; // unparseable IPv6 -> fail closed

  // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible (::a.b.c.d,
  // incl. :: and ::1) embed an IPv4 address in the low 32 bits. Check it via the
  // IPv4 rules so loopback/private/metadata targets can't slip through an IPv6
  // literal — the URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1, which
  // a dotted-only regex would miss.
  const highBitsZero = bytes.slice(0, 10).every((part) => part === 0);
  const isMapped = highBitsZero && bytes[10] === 0xff && bytes[11] === 0xff;
  const isCompat = bytes.slice(0, 12).every((part) => part === 0);
  if (isMapped || isCompat) {
    return isBlockedIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  const firstHextet = (bytes[0] << 8) | bytes[1];
  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) || // unique local fc00::/7
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) || // link-local fe80::/10
    firstHextet >= 0xff00 // multicast ff00::/8
  );
}

export async function assertSafeRemoteImageUrl(
  rawUrl: string,
  options: Pick<RemoteImageFetchOptions, "allowedHosts"> = {}
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Remote image URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Remote image URLs must use https.");
  }
  if (url.username || url.password) {
    throw new Error("Remote image URLs must not include credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowedHosts = options.allowedHosts ?? allowedImageHosts();
  if (!isAllowedHost(hostname, allowedHosts)) {
    throw new Error(`Remote image host is not in BFL_IMAGE_HOST_ALLOWLIST: ${hostname}.`);
  }
  if (isBlockedHostname(hostname)) {
    throw new Error(`Remote image host is not public: ${hostname}.`);
  }

  // For a literal IP host there is no name resolution to race: pin the host itself.
  if (net.isIP(hostname)) {
    if (isBlockedRemoteAddress(hostname)) {
      throw new Error(`Remote image host resolves to a private or local address: ${hostname}.`);
    }
    return { url, address: hostname };
  }

  // Resolve ONCE and return a validated address so the caller can pin the socket
  // to it. Re-resolving at fetch time would reopen a DNS-rebinding TOCTOU.
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error(`Remote image host could not be resolved: ${hostname}.`);
  const blocked = records.find((record) => isBlockedRemoteAddress(record.address));
  if (blocked) {
    throw new Error(`Remote image host resolves to a private or local address: ${blocked.address}.`);
  }
  return { url, address: records[0].address };
}

function assertByteLimit(size: number, maxBytes: number, label: string) {
  if (size > maxBytes) {
    throw new Error(`${label} exceeds the ${formatBytes(maxBytes)} input limit.`);
  }
}

export function assertImageBufferLimit(buffer: Buffer, label: string, maxBytes = MAX_IMAGE_INPUT_BYTES) {
  assertByteLimit(buffer.byteLength, maxBytes, label);
}

// A net-style lookup that ALWAYS yields the single pre-validated address, so the
// socket can't be re-pointed (DNS rebinding) between the safety check and the
// request. SNI/Host stay the original hostname, so TLS still validates the cert.
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
export function pinnedLookup(address: string) {
  const family = net.isIP(address) || 4;
  return (_hostname: string, options: unknown, callback?: LookupCallback): void => {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const wantsAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
    if (wantsAll) cb(null, [{ address, family }]);
    else cb(null, address, family);
  };
}

// GET an https URL while connecting only to `address` (the pre-validated IP).
// Mirrors the previous fetch() guarantees: https-only, redirects refused, and a
// hard byte cap enforced on both Content-Length and the streamed body.
function fetchPinnedHttps(url: URL, address: string, label: string, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  const servername = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const succeed = (buffer: Buffer) => {
      if (!settled) {
        settled = true;
        resolve(buffer);
      }
    };

    const request = https.request(
      url.href,
      {
        method: "GET",
        servername,
        lookup: pinnedLookup(address) as unknown as https.RequestOptions["lookup"]
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          return fail(new Error(`Could not fetch ${label}: redirects are not followed.`));
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          return fail(new Error(`Could not fetch ${label}: HTTP ${status}`));
        }
        const declared = Number(response.headers["content-length"] || "0");
        if (Number.isFinite(declared) && declared > maxBytes) {
          response.destroy();
          return fail(new Error(`${label} exceeds the ${formatBytes(maxBytes)} input limit.`));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            response.destroy();
            fail(new Error(`${label} exceeds the ${formatBytes(maxBytes)} input limit.`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => succeed(Buffer.concat(chunks, total)));
        response.on("error", fail);
      }
    );
    request.on("error", fail);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out fetching ${label}.`));
    });
    request.end();
  });
}

export async function fetchRemoteImageBuffer(rawUrl: string, label: string, options: RemoteImageFetchOptions = {}) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_INPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS;
  const { url, address } = await assertSafeRemoteImageUrl(rawUrl, { allowedHosts: options.allowedHosts });
  return fetchPinnedHttps(url, address, label, maxBytes, timeoutMs);
}
