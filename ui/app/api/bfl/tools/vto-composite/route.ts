import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { embedPngMetadata } from "@/lib/png-metadata";
import { prepareVtoGarmentInput } from "@/lib/bfl-tool-inputs";
import { resolveImageInput, saveOutputFiles } from "@/lib/bfl-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VtoCompositeBody = {
  image?: string;
  sourceAssetId?: string;
  sourceAssetTitle?: string;
  garments?: string[];
  garmentAssetIds?: string[];
  garmentTitles?: string[];
  prompt?: string;
  title?: string;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export async function POST(request: NextRequest) {
  let body: VtoCompositeBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const garmentInputs = cleanStringArray(body.garments).slice(0, 4);
  if (garmentInputs.length < 2) {
    return jsonError("A VTO garment collage needs at least two garment images.");
  }

  const origin = new URL(request.url).origin;
  let garment;
  try {
    const resolvedGarments = (
      await Promise.all(garmentInputs.map((item) => resolveImageInput(item, origin)))
    ).filter((item): item is string => Boolean(item));
    garment = await prepareVtoGarmentInput(resolvedGarments);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid garment images.", 400);
  }

  if (!garment.composite) {
    return jsonError("A VTO garment collage needs at least two garment images.");
  }

  const id = `vto-garment-collage-${randomUUID()}`;
  const prompt = body.prompt?.trim() || "[vto garment collage sent to BFL]";
  const title = `vto garment collage - ${body.title || "virtual try-on"}`;
  const garmentAssetIds = cleanStringArray(body.garmentAssetIds).slice(0, garment.count);
  const garmentTitles = cleanStringArray(body.garmentTitles).slice(0, garment.count);
  const garmentSummary = {
    count: garment.count,
    composite: garment.composite,
    width: garment.width,
    height: garment.height
  };
  const metadata = {
    id,
    model: "vto-garment-composite",
    provider: "local-vto-preflight",
    endpointName: "flux-tools/vto-v1",
    tool: "vto",
    sourceAssetId: body.sourceAssetId || null,
    sourceAssetTitle: body.sourceAssetTitle || null,
    garmentSummary,
    operation: "vto-garment-composite",
    assetKind: "asset",
    runSettings: {
      title,
      provider: "local-vto-preflight",
      model: "vto-garment-composite",
      endpointName: "flux-tools/vto-v1",
      tool: "vto",
      sourceAssetId: body.sourceAssetId || null,
      sourceAssetTitle: body.sourceAssetTitle || null,
      garmentAssetIds,
      garmentTitles,
      garmentSummary,
      operation: "vto-garment-composite",
      sentToBflAs: "garment",
      createdAt: new Date().toISOString()
    },
    payload: {
      prompt,
      width: garment.width,
      height: garment.height,
      sourceAssetId: body.sourceAssetId || null,
      sourceAssetTitle: body.sourceAssetTitle || null,
      garmentAssetIds,
      garmentTitles,
      garmentSummary,
      garmentCount: garment.count,
      sentToBflAs: "garment"
    }
  };

  const imageBuffer = embedPngMetadata(Buffer.from(garment.base64, "base64"), metadata);
  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  const outputFiles = await saveOutputFiles({
    id,
    title,
    prompt: `[vto garment collage sent to BFL] ${prompt}`.trim(),
    imageBuffer,
    extension: "png",
    metadata
  });

  return NextResponse.json({
    id,
    garmentSummary,
    garmentComposite: {
      id,
      title,
      imageDataUrl,
      count: garment.count,
      width: garment.width,
      height: garment.height,
      outputFiles
    }
  });
}
