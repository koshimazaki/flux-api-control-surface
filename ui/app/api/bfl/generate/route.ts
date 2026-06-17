import { NextRequest, NextResponse } from "next/server";
import {
  BFL_API_BASE,
  bflJson,
  contentTypeForExtension,
  getCredits,
  imageToDataUrl,
  normalizeImageInput,
  outputExtension,
  pollResult,
  redactImagePayload,
  resolveApiKey,
  saveOutputFiles
} from "@/lib/bfl-server";
import { embedPngMetadata } from "@/lib/png-metadata";
import { getBflModel, validateBflGenerationRequest } from "@/lib/provider-registry";
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
  promptUpsampling: boolean;
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
    promptUpsampling: options.promptUpsampling,
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
  const modelConfig = getBflModel(model);

  if (!apiKey) return jsonError("FLUX API key is required");
  if (!prompt) return jsonError("Prompt is required");
  if (!modelConfig) return jsonError(`Unknown model: ${model}`);

  const references = Array.isArray(body.references) ? body.references.filter(Boolean) : [];
  const normalizedReferences = references.map((reference) => normalizeImageInput(reference)).filter(Boolean) as string[];
  const width = typeof body.width === "number" ? body.width : 1024;
  const height = typeof body.height === "number" ? body.height : 1024;
  const validation = validateBflGenerationRequest({
    model: modelConfig,
    width,
    height,
    referenceCount: normalizedReferences.length
  });
  if (validation) return jsonError(validation);

  const endpointName = modelConfig.endpoint;
  const outputFormat = body.outputFormat || "png";
  const payload: Record<string, unknown> = {
    prompt,
    width,
    height,
    output_format: outputFormat
  };

  const shouldUpsample = modelConfig.supportsPromptUpsampling && body.promptUpsampling !== false;
  if (typeof body.seed === "number") payload.seed = body.seed;
  if (modelConfig.supportsPromptUpsampling && !shouldUpsample) payload.disable_pup = true;
  if (typeof body.safetyTolerance === "number") payload.safety_tolerance = body.safetyTolerance;
  normalizedReferences.forEach((reference, index) => {
    payload[index === 0 ? "input_image" : `input_image_${index + 1}`] = reference;
  });

  try {
    const creditsBefore = await getCredits(apiKey);
    const submitted = await bflJson("POST", `${BFL_API_BASE}/${endpointName}`, apiKey, payload);
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
    const safePayload = redactImagePayload(payload);
    const runSettings = buildRunSettings({
      title: body.title || "bfl-generation",
      model,
      endpointName,
      payload: safePayload,
      references: normalizedReferences,
      referenceWeight: body.referenceWeight,
      promptUpsampling: shouldUpsample,
      submitted
    });
    const metadata = {
      id: submitted.id,
      pollingUrl,
      sampleUrl,
      model,
      endpointName,
      runSettings,
      payload: safePayload,
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
