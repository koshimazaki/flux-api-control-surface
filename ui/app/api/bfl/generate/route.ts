import { NextRequest, NextResponse } from "next/server";
import {
  BFL_API_BASE,
  bflJson,
  contentTypeForExtension,
  getCredits,
  imageToDataUrl,
  outputExtension,
  pollResult,
  redactImagePayload,
  resolveApiKey,
  resolveImageInput,
  saveOutputFiles
} from "@/lib/bfl-server";
import { prepareToolImageInput } from "@/lib/bfl-tool-inputs";
import { embedPngMetadata } from "@/lib/png-metadata";
import { resolveFinetuneGeneration } from "@/lib/finetune-registry";
import {
  BFL_MAX_MEGAPIXELS,
  bflFinetunedKleinModel,
  getBflModel,
  validateBflGenerationRequest
} from "@/lib/provider-registry";
import { toStoredReferenceMeta } from "@/lib/reference-roles";
import { syncOutputToRemote } from "@/lib/remote-archive";
import type { ReferenceImage } from "@/lib/types";

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
  referenceMeta?: Array<Partial<ReferenceImage>>;
  referenceWeight?: number;
  title?: string;
  finetuneId?: string;
  finetuneStrength?: number | null;
  normalizeReferences?: boolean;
};

type PreparedReference = {
  image: string;
  diagnostic: {
    slot: string;
    normalized: boolean;
    format: "jpeg" | "passthrough";
    width?: number;
    height?: number;
    bytes?: number;
  };
};

const GENERATION_REFERENCE_ASPECT_RATIOS = [
  [1, 1],
  [5, 4],
  [4, 5],
  [4, 3],
  [3, 4],
  [16, 9],
  [9, 16],
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3]
] as const;

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function readGenerateBody(request: NextRequest): Promise<GenerateBody> {
  const raw = await request.text();
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const isJsonRequest = request.headers.get("content-type")?.toLowerCase().includes("application/json");

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as GenerateBody;
    }
    return { prompt: typeof parsed === "string" ? parsed : raw };
  } catch {
    if (isJsonRequest) {
      throw new Error("Request body must be valid JSON.");
    }
    return { prompt: raw };
  }
}

async function prepareGenerationReferences(references: unknown, origin: string, normalizeReferences: boolean) {
  if (!Array.isArray(references)) return [];
  const inputs = references.filter(
    (reference): reference is string => typeof reference === "string" && Boolean(reference.trim())
  );
  return Promise.all(
    inputs.map(async (reference, index) => {
      const resolved = await resolveImageInput(reference, origin);
      const slot = index === 0 ? "input_image" : `input_image_${index + 1}`;
      if (!normalizeReferences) {
        return {
          image: resolved || "",
          diagnostic: { slot, normalized: false, format: "passthrough" }
        } satisfies PreparedReference;
      }
      const prepared = await prepareToolImageInput(resolved, `reference image ${index + 1}`, {
        dimensionMultiple: 8,
        flattenBackground: "#ffffff",
        imageFormat: "jpeg",
        jpegQuality: 95,
        maxDimension: 1280,
        maxMegapixels: BFL_MAX_MEGAPIXELS,
        targetAspectRatios: GENERATION_REFERENCE_ASPECT_RATIOS
      });
      return {
        image: prepared.base64,
        diagnostic: {
          slot,
          normalized: true,
          format: "jpeg",
          width: prepared.width,
          height: prepared.height,
          bytes: Math.floor((prepared.base64.length * 3) / 4)
        }
      } satisfies PreparedReference;
    })
  ).then((prepared) => prepared.filter((reference) => Boolean(reference.image)));
}

function buildRunSettings(options: {
  title: string;
  model: string;
  endpointName: string;
  payload: Record<string, unknown>;
  references: string[];
  referenceWeight?: number;
  promptUpsampling: boolean;
  finetuneId?: string | null;
  finetuneStrength?: number | null;
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
    finetuneId: options.finetuneId ?? null,
    finetuneStrength: options.finetuneStrength ?? null,
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
    body = await readGenerateBody(request);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not read request body");
  }

  const apiKey = await resolveApiKey(body.apiKey);
  const prompt = body.prompt?.trim();
  // When a finetuneId is present, generation targets the hosted klein finetuned
  // endpoint with klein-9b capabilities, regardless of the requested model.
  const finetune = resolveFinetuneGeneration(body);
  const requestedModel = body.model || "pro-preview";
  const modelConfig = finetune ? bflFinetunedKleinModel() : getBflModel(requestedModel);

  if (!apiKey) return jsonError("FLUX API key is required");
  if (!prompt) return jsonError("Prompt is required");
  if (!modelConfig) return jsonError(`Unknown model: ${requestedModel}`);
  const model = modelConfig.value;

  const origin = new URL(request.url).origin;
  let preparedReferences: PreparedReference[];
  try {
    preparedReferences = await prepareGenerationReferences(body.references, origin, body.normalizeReferences !== false);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid reference image");
  }
  const normalizedReferences = preparedReferences.map((reference) => reference.image);
  const referenceDiagnostics = preparedReferences.map((reference) => reference.diagnostic);
  const width = typeof body.width === "number" ? body.width : 1024;
  const height = typeof body.height === "number" ? body.height : 1024;
  const validation = validateBflGenerationRequest({
    model: modelConfig,
    width,
    height,
    referenceCount: normalizedReferences.length
  });
  if (validation) return jsonError(validation);

  const endpointName = finetune ? finetune.endpoint : modelConfig.endpoint;
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
  if (finetune) {
    payload.finetune_id = finetune.payload.finetune_id;
    payload.finetune_strength = finetune.payload.finetune_strength;
  }
  preparedReferences.forEach((reference) => {
    payload[reference.diagnostic.slot] = reference.image;
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
      finetuneId: finetune?.finetuneId ?? null,
      finetuneStrength: finetune?.finetuneStrength ?? null,
      submitted
    });
    const metadata = {
      id: submitted.id,
      pollingUrl,
      sampleUrl,
      model,
      endpointName,
      finetune: finetune ? { id: finetune.finetuneId, strength: finetune.finetuneStrength } : null,
      runSettings,
      // Persisted so the gallery can rebuild reference thumbnails on reload.
      references: toStoredReferenceMeta(body.referenceMeta),
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
    return jsonError(error instanceof Error ? error.message : "Generation failed", 500, {
      references: referenceDiagnostics
    });
  }
}
