import {
  contentTypeForExtension,
  imageToDataUrl,
  outputExtension,
  redactImagePayload,
  resolveImageInput,
  saveOutputFiles
} from "@/lib/bfl-server";
import { prepareToolImageInput } from "@/lib/bfl-tool-inputs";
import { buildGenerationTiming } from "@/lib/generation-capture";
import { resolveFinetuneGeneration } from "@/lib/finetune-registry";
import { embedPngMetadata } from "@/lib/png-metadata";
import {
  BFL_MAX_MEGAPIXELS,
  bflFinetunedKleinModel,
  getBflModel,
  validateBflGenerationRequest
} from "@/lib/provider-registry";
import { toStoredReferenceMeta } from "@/lib/reference-roles";
import { syncOutputToRemote } from "@/lib/remote-archive";
import type { ReferenceImage } from "@/lib/types";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export type GenerateBody = {
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
  sourceAssetIds?: string[];
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
  referenceCount: number;
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
    referenceCount: options.referenceCount,
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

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as GenerateBody;
  const prompt = body.prompt?.trim();
  // When a finetuneId is present, generation targets the hosted klein finetuned
  // endpoint with klein-9b capabilities, regardless of the requested model.
  const finetune = resolveFinetuneGeneration(body);
  const requestedModel = body.model || "pro-preview";
  const modelConfig = finetune ? bflFinetunedKleinModel() : getBflModel(requestedModel);

  if (!prompt) return { error: "Prompt is required", status: 400 };
  if (!modelConfig) return { error: `Unknown model: ${requestedModel}`, status: 400 };
  const model = modelConfig.value;

  let preparedReferences: PreparedReference[];
  try {
    preparedReferences = await prepareGenerationReferences(body.references, origin, body.normalizeReferences !== false);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid reference image", status: 400 };
  }
  const referenceDiagnostics = preparedReferences.map((reference) => reference.diagnostic);
  const width = typeof body.width === "number" ? body.width : 1024;
  const height = typeof body.height === "number" ? body.height : 1024;
  const validation = validateBflGenerationRequest({
    model: modelConfig,
    width,
    height,
    referenceCount: preparedReferences.length
  });
  if (validation) return { error: validation, status: 400 };

  const endpointName = finetune ? finetune.endpoint : modelConfig.endpoint;
  const outputFormat = body.outputFormat || "png";
  const payload: Record<string, unknown> = { prompt, width, height, output_format: outputFormat };
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

  return {
    kind: "image" as const,
    operation: "generate",
    title: body.title || "bfl-generation",
    prompt,
    endpoint: endpointName,
    payload,
    sourceAssetIds: [
      ...new Set(
        [
          ...(Array.isArray(body.sourceAssetIds) ? body.sourceAssetIds : []),
          ...(body.referenceMeta || []).map((meta) => meta?.assetId)
        ].filter((value): value is string => Boolean(value))
      )
    ],
    failureDetails: { references: referenceDiagnostics },
    context: {
      model,
      endpointName,
      outputFormat,
      finetune,
      shouldUpsample,
      referenceCount: preparedReferences.length,
      referenceWeight: body.referenceWeight,
      referenceMeta: body.referenceMeta
    }
  } satisfies PreparedOperation;
}

async function finalize(input: OperationFinalizeInput) {
  const { prepared, submitted, result, marks } = input;
  const context = prepared.context;
  const sampleUrl = result.result?.sample as string;

  marks.downloadStartedAt = Date.now();
  const downloaded = await imageToDataUrl(sampleUrl);
  marks.downloadedAt = Date.now();

  const safePayload = redactImagePayload(prepared.payload);
  const runSettings = buildRunSettings({
    title: prepared.title,
    model: context.model,
    endpointName: context.endpointName,
    payload: safePayload,
    referenceCount: context.referenceCount,
    referenceWeight: context.referenceWeight,
    promptUpsampling: context.shouldUpsample,
    finetuneId: context.finetune?.finetuneId ?? null,
    finetuneStrength: context.finetune?.finetuneStrength ?? null,
    submitted
  });
  const metadata: Record<string, any> = {
    id: submitted.id,
    pollingUrl: input.pollingUrl,
    sampleUrl,
    model: context.model,
    endpointName: context.endpointName,
    finetune: context.finetune
      ? { id: context.finetune.finetuneId, strength: context.finetune.finetuneStrength }
      : null,
    runSettings,
    // Persisted so the gallery can rebuild reference thumbnails on reload.
    references: toStoredReferenceMeta(context.referenceMeta),
    payload: safePayload,
    queue: input.queue,
    timing: buildGenerationTiming(marks),
    submit: {
      cost: submitted.cost ?? null,
      inputMp: submitted.input_mp ?? null,
      outputMp: submitted.output_mp ?? null,
      creditsBefore: input.creditsBefore,
      creditsAfter: input.creditsAfter,
      creditDelta:
        typeof input.creditsBefore === "number" && typeof input.creditsAfter === "number"
          ? input.creditsBefore - input.creditsAfter
          : null
    },
    result
  };
  const extension = outputExtension(context.outputFormat, downloaded.contentType);
  const imageBuffer = extension === "png" ? embedPngMetadata(downloaded.buffer, metadata) : downloaded.buffer;
  const contentType = contentTypeForExtension(extension, downloaded.contentType);
  const imageDataUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;
  const id = submitted.id || `${Date.now()}`;
  const localOutputFiles = await saveOutputFiles({
    id,
    title: prepared.title,
    prompt: prepared.prompt,
    imageBuffer,
    extension,
    metadata
  });
  marks.savedAt = Date.now();
  // Re-stamp the timing now that the artifact is actually on disk, so finalizeMs
  // measures the save instead of being ~0 by construction.
  metadata.timing = buildGenerationTiming(marks);

  let remoteOutput = null;
  try {
    remoteOutput = await syncOutputToRemote({
      id,
      title: prepared.title,
      prompt: prepared.prompt,
      imageBuffer,
      contentType,
      extension,
      fileBaseName: localOutputFiles.fileBaseName,
      metadata
    });
  } catch (error) {
    remoteOutput = { ok: false, error: error instanceof Error ? error.message : "Remote archive sync failed" };
  }

  return {
    response: {
      ...metadata,
      imageDataUrl,
      outputFiles: { ...localOutputFiles, remote: remoteOutput }
    },
    result: {
      mediaType: "image" as const,
      assetId: String(metadata.id ?? id),
      localPath: localOutputFiles.imagePath,
      metadataPath: localOutputFiles.metadataPath
    },
    timing: metadata.timing,
    actualCredits: submitted.cost ?? null
  };
}

export const imageGenerateAdapter: OperationAdapter = {
  kind: "image",
  prepare,
  finalize,
  deliveryUrl(result) {
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include an image URL" };
  }
};
