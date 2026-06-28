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
  resolveImageInput,
  saveOutputFiles
} from "@/lib/bfl-server";
import { embedPngMetadata } from "@/lib/png-metadata";
import { prepareToolImageInput, prepareToolMaskInput, prepareVtoGarmentInput } from "@/lib/bfl-tool-inputs";
import { getBflImageTool, validateBflToolRequest } from "@/lib/provider-registry";
import { syncOutputToRemote } from "@/lib/remote-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolName = "erase" | "vto" | "outpaint" | "deblur";

type ToolBody = {
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
};

type LocalOutputFiles = Awaited<ReturnType<typeof saveOutputFiles>>;

type GarmentCompositeResponse = {
  id?: string;
  title?: string;
  imageDataUrl: string;
  count: number;
  width: number;
  height: number;
  outputFiles?: LocalOutputFiles;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

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

export async function POST(request: NextRequest) {
  let body: ToolBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const apiKey = await resolveApiKey(body.apiKey);
  const tool = body.tool;
  const toolConfig = tool ? getBflImageTool(tool) : undefined;
  if (!apiKey) return jsonError("FLUX API key is required");
  if (!tool || !toolConfig) return jsonError(`Unknown tool: ${tool || "(none)"}`);

  const origin = new URL(request.url).origin;
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
  if (validation) return jsonError(validation);

  let preparedBody = resolvedBody;
  let maskCoverage: number | null = null;
  let garmentSummary: { count: number; composite: boolean; width: number; height: number } | null = null;
  let garmentComposite: GarmentCompositeResponse | null = null;
  let garmentCompositeBuffer: Buffer | null = null;
  let sourceDimensions: { width: number; height: number } | null = null;
  try {
    const source = await prepareToolImageInput(resolvedBody.image, "source image");
    sourceDimensions = { width: source.width, height: source.height };
    preparedBody = {
      ...resolvedBody,
      image: source.base64
    };
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
      if (garment.composite) {
        garmentCompositeBuffer = Buffer.from(garment.base64, "base64");
        garmentComposite = {
          imageDataUrl: `data:image/png;base64,${garment.base64}`,
          count: garment.count,
          width: garment.width,
          height: garment.height
        };
      }
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid image tool input.", 400);
  }

  // A mask that thresholds to zero white pixels tells the erase endpoint to keep every
  // pixel, so it returns the source unchanged while still costing a credit.
  // Fail loudly instead of silently no-op'ing.
  if (tool === "erase" && maskCoverage !== null && maskCoverage <= 0) {
    return jsonError(
      "The mask is empty — paint a white area over the region you want to replace, then run again.",
      400
    );
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
  if (providerValidation) return jsonError(providerValidation);

  const endpointName = toolConfig.endpoint;
  const outputFormat = safeOutputFormat(tool, body.outputFormat);
  const payload = buildToolPayload(tool, preparedBody, outputFormat);
  const title = body.title || `${tool}-edit`;
  const promptForFiles = body.prompt?.trim() || `[${tool} pass, no prompt]`;

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
    const metadata = {
      id: submitted.id,
      pollingUrl,
      sampleUrl,
      model: endpointName,
      endpointName,
      tool,
      sourceAssetId: body.sourceAssetId || null,
      garmentSummary,
      runSettings: {
        title,
        provider: "bfl-api",
        model: endpointName,
        endpointName,
        tool,
        sourceAssetId: body.sourceAssetId || null,
        maskCoverage,
        garmentSummary,
        outputFormat,
        seed: typeof body.seed === "number" ? body.seed : null,
        requestId: submitted.id ?? null,
        submittedCost: submitted.cost ?? null,
        inputMp: submitted.input_mp ?? null,
        outputMp: submitted.output_mp ?? null,
        createdAt: new Date().toISOString()
      },
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
      title,
      prompt: promptForFiles,
      imageBuffer,
      extension,
      metadata
    });
    if (garmentComposite && garmentCompositeBuffer) {
      const compositeId = `${submitted.id || `${Date.now()}`}-garment-collage`;
      const compositeTitle = `vto garment collage - ${title}`;
      const compositePrompt = `[vto garment collage sent to BFL] ${promptForFiles}`.trim();
      const compositeMetadata = {
        id: compositeId,
        model: "vto-garment-composite",
        provider: "local-vto-preflight",
        endpointName,
        tool,
        sourceAssetId: body.sourceAssetId || null,
        garmentSummary,
        operation: "vto-garment-composite",
        assetKind: "asset",
        runSettings: {
          title: compositeTitle,
          provider: "local-vto-preflight",
          model: "vto-garment-composite",
          endpointName,
          tool,
          sourceAssetId: body.sourceAssetId || null,
          garmentSummary,
          operation: "vto-garment-composite",
          sentToBflAs: "garment",
          requestId: submitted.id ?? null,
          createdAt: new Date().toISOString()
        },
        payload: {
          prompt: compositePrompt,
          width: garmentComposite.width,
          height: garmentComposite.height,
          sourceAssetId: body.sourceAssetId || null,
          garmentSummary,
          garmentCount: garmentComposite.count,
          sentToBflAs: "garment"
        }
      };
      const compositeBuffer = embedPngMetadata(garmentCompositeBuffer, compositeMetadata);
      const compositeOutputFiles = await saveOutputFiles({
        id: compositeId,
        title: compositeTitle,
        prompt: compositePrompt,
        imageBuffer: compositeBuffer,
        extension: "png",
        metadata: compositeMetadata
      });
      garmentComposite = {
        ...garmentComposite,
        id: compositeId,
        title: compositeTitle,
        imageDataUrl: `data:image/png;base64,${compositeBuffer.toString("base64")}`,
        outputFiles: compositeOutputFiles
      };
    }
    let remoteOutput = null;
    try {
      remoteOutput = await syncOutputToRemote({
        id: submitted.id || `${Date.now()}`,
        title,
        prompt: promptForFiles,
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
      garmentComposite,
      outputFiles: {
        ...localOutputFiles,
        remote: remoteOutput
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : `${tool} run failed`, 500);
  }
}
