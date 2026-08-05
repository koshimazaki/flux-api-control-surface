import { saveOutputFiles } from "@/lib/bfl-server";
import { embedPngMetadata } from "@/lib/png-metadata";

type CompositeContext = {
  tool: string;
  endpointName: string;
  garmentCompositeBase64?: string | null;
  saveGarmentComposite?: boolean;
  garmentSummary?: { count: number; composite: boolean; width: number; height: number } | null;
  sourceAssetId?: string | null;
  sourceAssetTitle?: string | null;
  garmentAssetIds?: string[];
  garmentTitles?: string[];
};

/**
 * VTO can collage several garments into one image before submitting it. The
 * collage is saved as its own gallery asset so the exact bytes sent to BFL stay
 * recoverable, which is why it lives beside the main tool output.
 */
export async function buildGarmentCompositeOutput(options: {
  context: CompositeContext;
  requestId?: string;
  title: string;
  prompt: string;
}) {
  const { context } = options;
  if (!context.garmentCompositeBase64 || !context.garmentSummary) return null;

  const compositeBuffer = Buffer.from(context.garmentCompositeBase64, "base64");
  const base = {
    imageDataUrl: `data:image/png;base64,${context.garmentCompositeBase64}`,
    count: context.garmentSummary.count,
    width: context.garmentSummary.width,
    height: context.garmentSummary.height
  };
  if (!context.saveGarmentComposite) return base;

  const compositeId = `${options.requestId || `${Date.now()}`}-garment-collage`;
  const compositeTitle = `vto garment collage - ${options.title}`;
  const compositePrompt = `[vto garment collage sent to BFL] ${options.prompt}`.trim();
  const compositeMetadata = {
    id: compositeId,
    model: "vto-garment-composite",
    provider: "local-vto-preflight",
    endpointName: context.endpointName,
    tool: context.tool,
    sourceAssetId: context.sourceAssetId ?? null,
    sourceAssetTitle: context.sourceAssetTitle ?? null,
    garmentAssetIds: context.garmentAssetIds || [],
    garmentTitles: context.garmentTitles || [],
    garmentSummary: context.garmentSummary,
    operation: "vto-garment-composite",
    assetKind: "asset",
    runSettings: {
      title: compositeTitle,
      provider: "local-vto-preflight",
      model: "vto-garment-composite",
      endpointName: context.endpointName,
      tool: context.tool,
      sourceAssetId: context.sourceAssetId ?? null,
      sourceAssetTitle: context.sourceAssetTitle ?? null,
      garmentAssetIds: context.garmentAssetIds || [],
      garmentTitles: context.garmentTitles || [],
      garmentSummary: context.garmentSummary,
      operation: "vto-garment-composite",
      sentToBflAs: "garment",
      requestId: options.requestId ?? null,
      createdAt: new Date().toISOString()
    },
    payload: {
      prompt: compositePrompt,
      width: context.garmentSummary.width,
      height: context.garmentSummary.height,
      sourceAssetId: context.sourceAssetId ?? null,
      sourceAssetTitle: context.sourceAssetTitle ?? null,
      garmentAssetIds: context.garmentAssetIds || [],
      garmentTitles: context.garmentTitles || [],
      garmentSummary: context.garmentSummary,
      garmentCount: context.garmentSummary.count,
      sentToBflAs: "garment"
    }
  };
  const embedded = embedPngMetadata(compositeBuffer, compositeMetadata);
  const outputFiles = await saveOutputFiles({
    id: compositeId,
    title: compositeTitle,
    prompt: compositePrompt,
    imageBuffer: embedded,
    extension: "png",
    metadata: compositeMetadata
  });
  return {
    ...base,
    id: compositeId,
    title: compositeTitle,
    imageDataUrl: `data:image/png;base64,${embedded.toString("base64")}`,
    outputFiles
  };
}
