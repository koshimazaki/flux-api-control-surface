import {
  contentTypeForExtension,
  imageToDataUrl,
  normalizeImageInput,
  outputExtension,
  redactImagePayload,
  resolveImageInput,
  saveOutputFiles
} from "@/lib/bfl-server";
import { prepareToolImageInput, prepareToolMaskInput, prepareVtoGarmentInput } from "@/lib/bfl-tool-inputs";
import { buildGenerationTiming } from "@/lib/generation-capture";
import { embedPngMetadata } from "@/lib/png-metadata";
import { getBflImageTool, validateBflToolRequest } from "@/lib/provider-registry";
import { syncOutputToRemote } from "@/lib/remote-archive";
import { buildGarmentCompositeOutput } from "./image-tool-composite";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export type ToolName = "erase" | "vto" | "outpaint" | "deblur";

export type ToolBody = {
  apiKey?: string;
  tool?: ToolName;
  image?: string;
  mask?: string;
  garment?: string;
  garments?: string[];
  prompt?: string;
  seed?: number | null;
  dilatePixels?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  offsetX?: number | null;
  offsetY?: number | null;
  mode?: "high" | "fast";
  guidance?: number;
  steps?: number;
  autoCrop?: boolean;
  safetyTolerance?: number;
  outputFormat?: "jpeg" | "png" | "webp";
  title?: string;
  sourceAssetId?: string;
  sourceAssetTitle?: string;
  garmentAssetIds?: string[];
  garmentTitles?: string[];
  saveGarmentComposite?: boolean;
};

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toolSafetyToleranceMax(_tool: ToolName) {
  return 5;
}

function toolSupportsSafetyTolerance(tool: ToolName) {
  return tool === "vto" || tool === "deblur";
}

function safeOutputFormat(tool: ToolName, value: unknown) {
  if (tool === "erase" || tool === "outpaint") {
    return value === "jpeg" || value === "png" ? value : "png";
  }
  return value === "jpeg" || value === "webp" || value === "png" ? value : "png";
}

function buildToolPayload(tool: ToolName, body: ToolBody, outputFormat: string) {
  if (tool === "deblur") {
    const payload: Record<string, unknown> = {
      image: normalizeImageInput(body.image),
      output_format: outputFormat
    };
    if (toolSupportsSafetyTolerance(tool)) {
      payload.safety_tolerance = clampInt(body.safetyTolerance ?? 2, 0, toolSafetyToleranceMax(tool));
    }
    if (typeof body.seed === "number") payload.seed = body.seed;
    return payload;
  }
  if (tool === "erase") {
    const payload: Record<string, unknown> = {
      image: normalizeImageInput(body.image),
      mask: normalizeImageInput(body.mask),
      dilate_pixels: clampInt(body.dilatePixels ?? 10, 0, 25),
      output_format: outputFormat
    };
    if (toolSupportsSafetyTolerance(tool)) {
      payload.safety_tolerance = clampInt(body.safetyTolerance ?? 2, 0, toolSafetyToleranceMax(tool));
    }
    if (typeof body.seed === "number") payload.seed = body.seed;
    return payload;
  }
  if (tool === "vto") {
    const payload: Record<string, unknown> = {
      person: normalizeImageInput(body.image),
      garment: normalizeImageInput(body.garment),
      prompt: body.prompt?.trim() || "",
      safety_tolerance: clampInt(body.safetyTolerance ?? 2, 0, toolSafetyToleranceMax(tool)),
      output_format: outputFormat
    };
    if (typeof body.seed === "number") payload.seed = body.seed;
    return payload;
  }
  const payload: Record<string, unknown> = {
    input_image: normalizeImageInput(body.image),
    width: body.canvasWidth,
    height: body.canvasHeight,
    auto_crop: Boolean(body.autoCrop),
    mode: body.mode === "fast" ? "fast" : "high",
    output_format: outputFormat
  };
  if (toolSupportsSafetyTolerance(tool)) {
    payload.safety_tolerance = clampInt(body.safetyTolerance ?? 2, 0, toolSafetyToleranceMax(tool));
  }
  if (body.prompt?.trim()) payload.prompt = body.prompt.trim();
  if (typeof body.offsetX === "number") payload.reference_offset_x = Math.round(body.offsetX);
  if (typeof body.offsetY === "number") payload.reference_offset_y = Math.round(body.offsetY);
  return payload;
}

function validateToolBody(tool: ToolName, body: ToolBody) {
  if (!body.image) return "A source image is required.";
  if (tool === "erase" && !body.mask) {
    return "Paint a mask over the area first.";
  }
  if (tool === "vto" && !(body.garment || body.garments?.length)) {
    return "Virtual Try-On needs at least one garment reference.";
  }
  if (tool === "vto" && !body.prompt?.trim()) {
    return "Virtual Try-On needs a styling prompt.";
  }
  if (tool === "outpaint" && (!body.canvasWidth || !body.canvasHeight)) {
    return "Outpaint needs a target canvas width and height.";
  }
  return "";
}

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as ToolBody;
  const tool = body.tool;
  const toolConfig = tool ? getBflImageTool(tool) : undefined;
  if (!tool || !toolConfig) return { error: `Unknown tool: ${tool || "(none)"}`, status: 400 };

  const garmentInputs = (body.garments?.length ? body.garments : body.garment ? [body.garment] : []).filter(Boolean);
  const resolvedGarments =
    garmentInputs.length > 0
      ? (await Promise.all(garmentInputs.map((garment) => resolveImageInput(garment, origin)))).filter(
          (garment): garment is string => Boolean(garment)
        )
      : undefined;
  const resolvedBody: ToolBody = {
    ...body,
    image: await resolveImageInput(body.image, origin, body.sourceAssetId),
    mask: await resolveImageInput(body.mask, origin),
    garments: resolvedGarments
  };
  if (resolvedBody.garments?.length) resolvedBody.garment = resolvedBody.garments[0];
  const validation = validateToolBody(tool, resolvedBody);
  if (validation) return { error: validation, status: 400 };

  let preparedBody = resolvedBody;
  let maskCoverage: number | null = null;
  let garmentSummary: { count: number; composite: boolean; width: number; height: number } | null = null;
  let garmentCompositeBase64: string | null = null;
  let sourceDimensions: { width: number; height: number } | null = null;
  try {
    const source = await prepareToolImageInput(resolvedBody.image, "source image");
    sourceDimensions = { width: source.width, height: source.height };
    preparedBody = { ...resolvedBody, image: source.base64 };
    if (tool === "erase") {
      const mask = await prepareToolMaskInput(resolvedBody.mask, source, "mask");
      preparedBody.mask = mask.base64;
      maskCoverage = mask.coverage;
    }
    if (tool === "vto") {
      const garment = await prepareVtoGarmentInput(resolvedBody.garments || []);
      preparedBody.garment = garment.base64;
      garmentSummary = {
        count: garment.count,
        composite: garment.composite,
        width: garment.width,
        height: garment.height
      };
      if (garment.composite) garmentCompositeBase64 = garment.base64;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid image tool input.", status: 400 };
  }

  // A mask that thresholds to zero white pixels tells the erase endpoint to keep every
  // pixel, so it returns the source unchanged while still costing a credit.
  // Fail loudly instead of silently no-op'ing.
  if (tool === "erase" && maskCoverage !== null && maskCoverage <= 0) {
    return {
      error: "The mask is empty — paint a white area over the region you want to replace, then run again.",
      status: 400
    };
  }
  if (maskCoverage !== null) {
    console.error(`[bfl/${tool}] endpoint=${toolConfig.endpoint} mask_coverage=${(maskCoverage * 100).toFixed(1)}%`);
  }

  const providerValidation = validateBflToolRequest({
    tool: toolConfig,
    image: preparedBody.image,
    imageWidth: sourceDimensions?.width,
    imageHeight: sourceDimensions?.height,
    canvasWidth: body.canvasWidth,
    canvasHeight: body.canvasHeight,
    mode: body.mode
  });
  if (providerValidation) return { error: providerValidation, status: 400 };

  const outputFormat = safeOutputFormat(tool, body.outputFormat);
  const title = body.title || `${tool}-edit`;
  return {
    kind: "tool" as const,
    operation: tool,
    title,
    prompt: body.prompt?.trim() || `[${tool} pass, no prompt]`,
    endpoint: toolConfig.endpoint,
    payload: buildToolPayload(tool, preparedBody, outputFormat),
    sourceAssetIds: [body.sourceAssetId, ...(body.garmentAssetIds || [])].filter((value): value is string =>
      Boolean(value)
    ),
    context: {
      tool,
      endpointName: toolConfig.endpoint,
      outputFormat,
      maskCoverage,
      garmentSummary,
      garmentCompositeBase64,
      saveGarmentComposite: body.saveGarmentComposite !== false,
      sourceAssetId: body.sourceAssetId || null,
      sourceAssetTitle: body.sourceAssetTitle || null,
      garmentAssetIds: Array.isArray(body.garmentAssetIds) ? body.garmentAssetIds.filter(Boolean).slice(0, 4) : [],
      garmentTitles: Array.isArray(body.garmentTitles) ? body.garmentTitles.filter(Boolean).slice(0, 4) : [],
      seed: typeof body.seed === "number" ? body.seed : null
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
  const metadata: Record<string, any> = {
    id: submitted.id,
    pollingUrl: input.pollingUrl,
    sampleUrl,
    model: context.endpointName,
    endpointName: context.endpointName,
    tool: context.tool,
    sourceAssetId: context.sourceAssetId,
    sourceAssetTitle: context.sourceAssetTitle,
    garmentAssetIds: context.garmentAssetIds,
    garmentTitles: context.garmentTitles,
    garmentSummary: context.garmentSummary,
    runSettings: {
      title: prepared.title,
      provider: "bfl-api",
      model: context.endpointName,
      endpointName: context.endpointName,
      tool: context.tool,
      sourceAssetId: context.sourceAssetId,
      sourceAssetTitle: context.sourceAssetTitle,
      garmentAssetIds: context.garmentAssetIds,
      garmentTitles: context.garmentTitles,
      maskCoverage: context.maskCoverage,
      garmentSummary: context.garmentSummary,
      outputFormat: context.outputFormat,
      seed: context.seed,
      requestId: submitted.id ?? null,
      submittedCost: submitted.cost ?? null,
      inputMp: submitted.input_mp ?? null,
      outputMp: submitted.output_mp ?? null,
      createdAt: new Date().toISOString()
    },
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
  const garmentComposite = await buildGarmentCompositeOutput({
    context: context as Parameters<typeof buildGarmentCompositeOutput>[0]["context"],
    requestId: submitted.id,
    title: prepared.title,
    prompt: prepared.prompt
  });
  marks.savedAt = Date.now();
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
      garmentComposite,
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

export const imageToolAdapter: OperationAdapter = {
  kind: "tool",
  prepare,
  finalize,
  deliveryUrl(result) {
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include an image URL" };
  }
};
