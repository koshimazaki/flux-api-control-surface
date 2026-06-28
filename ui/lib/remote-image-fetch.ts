import { lookup } from "node:dns/promises";
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

export function isBlockedRemoteAddress(address: string) {
  const normalized = address.toLowerCase();
  if (net.isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (net.isIP(normalized) !== 6) return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4[1]);
  if (normalized === "::" || normalized === "::1") return true;

  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    firstHextet >= 0xff00
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

  if (net.isIP(hostname)) {
    if (isBlockedRemoteAddress(hostname)) {
      throw new Error(`Remote image host resolves to a private or local address: ${hostname}.`);
    }
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error(`Remote image host could not be resolved: ${hostname}.`);
  const blocked = records.find((record) => isBlockedRemoteAddress(record.address));
  if (blocked) {
    throw new Error(`Remote image host resolves to a private or local address: ${blocked.address}.`);
  }
  return url;
}

function assertByteLimit(size: number, maxBytes: number, label: string) {
  if (size > maxBytes) {
    throw new Error(`${label} exceeds the ${formatBytes(maxBytes)} input limit.`);
  }
}

export function assertImageBufferLimit(buffer: Buffer, label: string, maxBytes = MAX_IMAGE_INPUT_BYTES) {
  assertByteLimit(buffer.byteLength, maxBytes, label);
}

export async function fetchRemoteImageBuffer(rawUrl: string, label: string, options: RemoteImageFetchOptions = {}) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_INPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS;
  const url = await assertSafeRemoteImageUrl(rawUrl, { allowedHosts: options.allowedHosts });
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url.href, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Could not fetch ${label}: redirects are not followed.`);
    }
    if (!response.ok) {
      throw new Error(`Could not fetch ${label}: HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 0) {
      assertByteLimit(contentLength, maxBytes, label);
    }
    if (!response.body) throw new Error(`Could not read ${label} response body.`);

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      assertByteLimit(total, maxBytes, label);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (timedOut) throw new Error(`Timed out fetching ${label}.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
