import { NextRequest, NextResponse } from "next/server";
import {
  BFL_API_BASE,
  bflJson,
  contentTypeForExtension,
  getCredits,
  imageToDataUrl,
  outputExtension,
  pollResult,
  resolveApiKey,
  saveOutputFiles
} from "@/lib/bfl-server";
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
  referenceWeight?: number;
  title?: string;
};

const API_BASE = BFL_API_BASE;
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

function buildRunSettings(options: {
  title: string;
  model: string;
  endpointName: string;
  payload: Record<string, unknown>;
  references: string[];
  referenceWeight?: number;
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
    referenceWeight: options.referenceWeight ?? null,
    requestId: options.submitted.id ?? null,
    submittedCost: options.submitted.cost ?? null,
    inputMp: options.submitted.input_mp ?? null,
    outputMp: options.submitted.output_mp ?? null,
    createdAt: new Date().toISOString()
  };
}

export async function POST(request: NextRequest) {
  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const apiKey = resolveApiKey(body.apiKey);
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
      referenceWeight: body.referenceWeight,
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
