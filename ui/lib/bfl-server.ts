import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const BFL_API_BASE = "https://api.bfl.ai/v1";

export function resolveApiKey(bodyKey?: string) {
  return bodyKey?.trim() || process.env.BFL_API_KEY?.trim() || process.env.FLUX_API_KEY?.trim();
}

export async function bflJson(method: "GET" | "POST", url: string, apiKey: string, payload?: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-key": apiKey
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store"
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`BFL API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data as Record<string, any>;
}

export async function pollResult(pollingUrl: string, apiKey: string) {
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    const result = await bflJson("GET", pollingUrl, apiKey);
    if (result.status === "Ready") return result;
    if (result.status === "Error" || result.status === "Failed") {
      throw new Error(`BFL generation failed: ${JSON.stringify(result)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("Timed out waiting for BFL result");
}

export async function getCredits(apiKey: string) {
  try {
    const result = await bflJson("GET", `${BFL_API_BASE}/credits`, apiKey);
    return typeof result.credits === "number" ? result.credits : null;
  } catch {
    return null;
  }
}

export async function imageToDataUrl(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download generated image: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    buffer,
    contentType
  };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function outputExtension(outputFormat?: string, contentType?: string) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (outputFormat === "png") return "png";
  if (outputFormat === "webp") return "webp";
  return "jpg";
}

export function contentTypeForExtension(extension: string, fallback: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg") return "image/jpeg";
  return fallback;
}

export function redactImagePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string" && (value.startsWith("data:") || value.length > 2048)
        ? "[image input omitted]"
        : value
    ])
  );
}

// BFL image/tool endpoints accept raw base64 or an HTTP(S) URL — not a data: URL.
// Dashboard masks (canvas.toDataURL) and gallery imageDataUrls arrive as data URLs,
// so strip the "data:<mediatype>;base64," prefix to the raw base64 payload.
export function normalizeImageInput(value?: string) {
  if (!value) return value;
  const match = value.match(/^data:[^,]*;base64,(.*)$/);
  return match ? match[1] : value;
}

export async function saveOutputFiles(options: {
  id: string;
  title: string;
  prompt: string;
  imageBuffer: Buffer;
  extension: string;
  metadata: Record<string, unknown>;
}) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safeTitle = slugify(options.title) || "bfl-generation";
  const baseName = `${date}_${stamp}_${safeTitle}_${options.id}`;
  const outputDir = path.resolve(process.cwd(), "..", "outputs", "bfl-api-dashboard", date);
  await mkdir(outputDir, { recursive: true });

  const imagePath = path.join(outputDir, `${baseName}.${options.extension}`);
  const promptPath = path.join(outputDir, `${baseName}.prompt.txt`);
  const metadataPath = path.join(outputDir, `${baseName}.json`);
  const metadataWithFiles = {
    ...options.metadata,
    outputFileBaseName: baseName,
    outputFileName: `${baseName}.${options.extension}`,
    outputPromptFileName: `${baseName}.prompt.txt`,
    outputMetadataFileName: `${baseName}.json`
  };

  await Promise.all([
    writeFile(imagePath, options.imageBuffer),
    writeFile(promptPath, options.prompt, "utf8"),
    writeFile(metadataPath, JSON.stringify(metadataWithFiles, null, 2), "utf8")
  ]);

  return { imagePath, promptPath, metadataPath, outputDir, fileBaseName: baseName };
}
