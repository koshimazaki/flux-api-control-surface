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
import { getBflImageTool, validateBflToolRequest } from "@/lib/provider-registry";
import { syncOutputToRemote } from "@/lib/remote-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolName = "erase" | "inpaint" | "outpaint";

type ToolBody = {
  apiKey?: string;
  tool?: ToolName;
  image?: string;
  mask?: string;
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
  outputFormat?: "jpeg" | "png" | "webp";
  title?: string;
  sourceAssetId?: string;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildToolPayload(tool: ToolName, body: ToolBody, outputFormat: string) {
  if (tool === "erase") {
    const payload: Record<string, unknown> = {
      image: normalizeImageInput(body.image),
      mask: normalizeImageInput(body.mask),
      dilate_pixels: clampInt(body.dilatePixels ?? 10, 0, 25),
      output_format: outputFormat
    };
    if (typeof body.seed === "number") payload.seed = body.seed;
    return payload;
  }
  if (tool === "inpaint") {
    const payload: Record<string, unknown> = {
      image: normalizeImageInput(body.image),
      mask: normalizeImageInput(body.mask),
      prompt: body.prompt || "",
      output_format: outputFormat
    };
    if (typeof body.seed === "number") payload.seed = body.seed;
    if (typeof body.guidance === "number") payload.guidance = body.guidance;
    if (typeof body.steps === "number") payload.steps = clampInt(body.steps, 15, 50);
    return payload;
  }
  const payload: Record<string, unknown> = {
    input_image: normalizeImageInput(body.image),
    width: body.canvasWidth,
    height: body.canvasHeight,
    mode: body.mode === "fast" ? "fast" : "high",
    output_format: outputFormat
  };
  if (body.prompt?.trim()) payload.prompt = body.prompt.trim();
  if (typeof body.offsetX === "number") payload.reference_offset_x = Math.round(body.offsetX);
  if (typeof body.offsetY === "number") payload.reference_offset_y = Math.round(body.offsetY);
  return payload;
}

function validateToolBody(tool: ToolName, body: ToolBody) {
  if (!body.image) return "A source image is required.";
  if ((tool === "erase" || tool === "inpaint") && !body.mask) {
    return "Paint a mask over the area first.";
  }
  if (tool === "inpaint" && !body.prompt?.trim()) {
    return "Inpaint needs a prompt describing the replacement (use Erase for prompt-free removal).";
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
  const resolvedBody: ToolBody = {
    ...body,
    image: await resolveImageInput(body.image, origin),
    mask: await resolveImageInput(body.mask, origin)
  };
  const validation = validateToolBody(tool, body);
  if (validation) return jsonError(validation);
  const providerValidation = validateBflToolRequest({
    tool: toolConfig,
    image: resolvedBody.image,
    canvasWidth: body.canvasWidth,
    canvasHeight: body.canvasHeight,
    mode: body.mode
  });
  if (providerValidation) return jsonError(providerValidation);

  const endpointName = toolConfig.endpoint;
  const outputFormat = body.outputFormat || "png";
  const payload = buildToolPayload(tool, resolvedBody, outputFormat);
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
      runSettings: {
        title,
        provider: "bfl-api",
        model: endpointName,
        endpointName,
        tool,
        sourceAssetId: body.sourceAssetId || null,
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
      outputFiles: {
        ...localOutputFiles,
        remote: remoteOutput
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : `${tool} run failed`, 500);
  }
}
