import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { embedPngMetadata } from "@/lib/png-metadata";
import { syncOutputToRemote } from "@/lib/remote-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateBody = {
  apiKey?: string;
  model?: string;
  prompt?: string;
  width?: number;
  height?: number;
  outputFormat?: "jpeg" | "png" | "webp";
  seed?: number | null;
  promptUpsampling?: boolean;
  safetyTolerance?: number | null;
  references?: string[];
  title?: string;
};

const API_BASE = "https://api.bfl.ai/v1";
const MODEL_ENDPOINTS: Record<string, string> = {
  max: "flux-2-max",
  "pro-preview": "flux-2-pro-preview",
  pro: "flux-2-pro",
  flex: "flux-2-flex",
  "klein-4b": "flux-2-klein-4b",
  "klein-9b-preview": "flux-2-klein-9b-preview",
  "klein-9b": "flux-2-klein-9b"
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function bflJson(method: "GET" | "POST", url: string, apiKey: string, payload?: unknown) {
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

async function pollResult(pollingUrl: string, apiKey: string) {
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

async function getCredits(apiKey: string) {
  try {
    const result = await bflJson("GET", `${API_BASE}/credits`, apiKey);
    return typeof result.credits === "number" ? result.credits : null;
  } catch {
    return null;
  }
}

async function imageToDataUrl(url: string) {
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function outputExtension(outputFormat?: string, contentType?: string) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (outputFormat === "png") return "png";
  if (outputFormat === "webp") return "webp";
  return "jpg";
}

function contentTypeForExtension(extension: string, fallback: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg") return "image/jpeg";
  return fallback;
}

function buildRunSettings(options: {
  title: string;
  model: string;
  endpointName: string;
  payload: Record<string, unknown>;
  references: string[];
  submitted: Record<string, any>;
}) {
  return {
    title: options.title,
    provider: "bfl-api",
    model: options.model,
    endpointName: options.endpointName,
    width: options.payload.width,
    height: options.payload.height,
    outputFormat: options.payload.output_format,
    seed: options.payload.seed ?? null,
    promptUpsampling: options.payload.disable_pup !== true,
    safetyTolerance: options.payload.safety_tolerance ?? null,
    referenceCount: options.references.length,
    requestId: options.submitted.id ?? null,
    submittedCost: options.submitted.cost ?? null,
    inputMp: options.submitted.input_mp ?? null,
    outputMp: options.submitted.output_mp ?? null,
    createdAt: new Date().toISOString()
  };
}

async function saveOutputFiles(options: {
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

export async function POST(request: NextRequest) {
  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const apiKey = body.apiKey?.trim() || process.env.BFL_API_KEY?.trim() || process.env.FLUX_API_KEY?.trim();
  const prompt = body.prompt?.trim();
  const model = body.model || "pro-preview";
  const endpointName = MODEL_ENDPOINTS[model];

  if (!apiKey) return jsonError("BFL API key is required");
  if (!prompt) return jsonError("Prompt is required");
  if (!endpointName) return jsonError(`Unknown model: ${model}`);

  const references = (body.references || []).filter(Boolean).slice(0, 3);
  const outputFormat = body.outputFormat || "png";
  const payload: Record<string, unknown> = {
    prompt,
    width: body.width || 1024,
    height: body.height || 1024,
    output_format: outputFormat
  };

  const shouldUpsample = body.promptUpsampling !== false && !endpointName.includes("klein");
  if (typeof body.seed === "number") payload.seed = body.seed;
  if (!shouldUpsample) payload.disable_pup = true;
  if (typeof body.safetyTolerance === "number") payload.safety_tolerance = body.safetyTolerance;
  references.forEach((reference, index) => {
    payload[index === 0 ? "input_image" : `input_image_${index + 1}`] = reference;
  });

  try {
    const creditsBefore = await getCredits(apiKey);
    const submitted = await bflJson("POST", `${API_BASE}/${endpointName}`, apiKey, payload);
    const pollingUrl = submitted.polling_url;
    if (!pollingUrl || typeof pollingUrl !== "string") {
      return jsonError("BFL response did not include a polling URL", 502, submitted);
    }

    const result = await pollResult(pollingUrl, apiKey);
    const creditsAfter = await getCredits(apiKey);
    const sampleUrl = result.result?.sample;
    if (!sampleUrl || typeof sampleUrl !== "string") {
      return jsonError("BFL result did not include an image URL", 502, result);
    }

    const downloaded = await imageToDataUrl(sampleUrl);
    const runSettings = buildRunSettings({
      title: body.title || "bfl-generation",
      model,
      endpointName,
      payload,
      references,
      submitted
    });
    const metadata = {
      id: submitted.id,
      pollingUrl,
      sampleUrl,
      model,
      endpointName,
      runSettings,
      payload,
      submit: {
        cost: submitted.cost ?? null,
        inputMp: submitted.input_mp ?? null,
        outputMp: submitted.output_mp ?? null,
        creditsBefore,
        creditsAfter,
        creditDelta:
          typeof creditsBefore === "number" && typeof creditsAfter === "number"
            ? creditsBefore - creditsAfter
            : null
      },
      result
    };
    const extension = outputExtension(outputFormat, downloaded.contentType);
    const imageBuffer =
      extension === "png" ? embedPngMetadata(downloaded.buffer, metadata) : downloaded.buffer;
    const contentType = contentTypeForExtension(extension, downloaded.contentType);
    const imageDataUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;
    const localOutputFiles = await saveOutputFiles({
      id: submitted.id || `${Date.now()}`,
      title: body.title || "bfl-generation",
      prompt,
      imageBuffer,
      extension,
      metadata
    });
    let remoteOutput = null;
    try {
      remoteOutput = await syncOutputToRemote({
        id: submitted.id || `${Date.now()}`,
        title: body.title || "bfl-generation",
        prompt,
        imageBuffer,
        contentType,
        extension,
        fileBaseName: localOutputFiles.fileBaseName,
        metadata
      });
    } catch (error) {
      remoteOutput = {
        ok: false,
        error: error instanceof Error ? error.message : "Remote archive sync failed"
      };
    }

    return NextResponse.json({
      ...metadata,
      imageDataUrl,
      outputFiles: {
        ...localOutputFiles,
        remote: remoteOutput
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Generation failed", 500);
  }
}
