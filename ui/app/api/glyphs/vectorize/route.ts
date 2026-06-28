import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { embedPngMetadata } from "@/lib/png-metadata";
import { resolveImageInput, saveOutputFiles, slugify } from "@/lib/bfl-server";
import { toWorkspaceRelativePath, workspaceRoot } from "@/lib/local-paths";
import { vectorizeGlyphImage, type ServerGlyphSettings } from "@/lib/glyph-server";
import { glyphPreviewBackgroundForSvg } from "@/lib/glyph-svg";
import type { Rect } from "@/lib/glyph-geometry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GlyphVectorizeBody = ServerGlyphSettings & {
  image?: string;
  sourceAssetId?: string;
  sourceTitle?: string;
  title?: string;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function isRect(value: unknown): value is Rect {
  const rect = value as Rect;
  return (
    !!rect &&
    typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.width === "number" &&
    typeof rect.height === "number"
  );
}

async function imageBufferFromInput(input: string, origin: string) {
  const resolved = await resolveImageInput(input, origin);
  if (!resolved) throw new Error("Image input is empty.");
  if (/^https?:\/\//i.test(resolved)) {
    const response = await fetch(resolved, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not fetch image: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.from(resolved, "base64");
}

async function addSvgMetadata(metadataPath: string, svgPath: string, svgFileName: string) {
  const absoluteMetadataPath = path.join(workspaceRoot(), metadataPath);
  const saved = JSON.parse(await readFile(absoluteMetadataPath, "utf8"));
  await writeFile(
    absoluteMetadataPath,
    JSON.stringify(
      {
        ...saved,
        outputSvgFileName: svgFileName,
        outputSvgPath: toWorkspaceRelativePath(svgPath)
      },
      null,
      2
    ),
    "utf8"
  );
}

export async function POST(request: NextRequest) {
  let body: GlyphVectorizeBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const sourceAssetId = body.sourceAssetId?.trim();
  const imageInput = body.image?.trim() || (sourceAssetId ? `/api/outputs/${encodeURIComponent(sourceAssetId)}/image` : "");
  if (!imageInput) return jsonError("Provide image or sourceAssetId.");

  try {
    const origin = new URL(request.url).origin;
    const input = await imageBufferFromInput(imageInput, origin);
    const result = await vectorizeGlyphImage(input, {
      colors: body.colors,
      minArea: body.minArea,
      knockoutBackground: body.knockoutBackground,
      targetMode: body.targetMode,
      maxTraceSize: body.maxTraceSize,
      selection: isRect(body.selection) ? body.selection : null
    });
    const id = `glyph-${randomUUID()}`;
    const sourceLabel = body.sourceTitle || sourceAssetId || "image";
    const title = body.title || `glyph-${result.colors}c-${slugify(sourceLabel) || "asset"}`;
    const prompt = `Local glyph vectorization from ${sourceLabel}: ${result.colors} colors, ${result.minArea}px despeckle.`;
    const previewBackground = glyphPreviewBackgroundForSvg(result.svg);
    const metadata = {
      id,
      model: "local-glyph",
      endpointName: "glyph-vectorize",
      provider: "local-glyph",
      operation: "glyphs",
      assetKind: "asset",
      sourceAssetId: sourceAssetId || null,
      sourceTitle: body.sourceTitle || null,
      payload: {
        prompt,
        colors: result.colors,
        minArea: result.minArea,
        knockoutBackground: result.knockoutBackground,
        targetMode: result.targetMode,
        maxTraceSize: result.maxTraceSize,
        selection: result.selection,
        width: result.outputWidth,
        height: result.outputHeight,
        previewBackground
      },
      runSettings: {
        title,
        provider: "local-glyph",
        model: "local-glyph",
        endpointName: "glyph-vectorize",
        operation: "glyphs",
        sourceAssetId: sourceAssetId || null,
        sourceTitle: body.sourceTitle || null,
        colors: result.colors,
        minArea: result.minArea,
        targetMode: result.targetMode,
        maxTraceSize: result.maxTraceSize,
        previewBackground,
        outputFormat: "png+svg",
        createdAt: new Date().toISOString()
      },
      result: {
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        cropWidth: result.cropWidth,
        cropHeight: result.cropHeight,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight
      }
    };
    const imageBuffer = embedPngMetadata(result.pngBuffer, metadata);
    const outputFiles = await saveOutputFiles({
      id,
      title,
      prompt,
      imageBuffer,
      extension: "png",
      metadata
    });
    const svgFileName = `${outputFiles.fileBaseName}.svg`;
    const svgPath = path.join(workspaceRoot(), outputFiles.outputDir, svgFileName);
    await writeFile(svgPath, result.svg, "utf8");
    await addSvgMetadata(outputFiles.metadataPath, svgPath, svgFileName);

    return NextResponse.json({
      ...metadata,
      imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      svg: result.svg,
      svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`,
      outputFiles: {
        ...outputFiles,
        svgPath: toWorkspaceRelativePath(svgPath)
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Glyph vectorization failed", 500);
  }
}
