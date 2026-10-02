import sharp from "sharp";
import { normalizeImageInput, resolveImageInput } from "@/lib/bfl-server";
import {
  FLUX3_IMAGE_MODEL,
  FLUX3_IMAGE_OPERATION,
  buildFlux3ImagePayload,
  flux3ImageInputs,
  flux3ImageRequestBlocker,
  normalizeFlux3ImageSettings,
  type Flux3ImageMode,
  type Flux3ImageRequest
} from "@/lib/flux3-image";
import { normalizeFrame, normalizeRequestBoxes } from "@/lib/flux3-image-boxes";
import { MAX_IMAGE_INPUT_BYTES, MAX_IMAGE_INPUT_PIXELS } from "@/lib/remote-image-fetch";
import type { ReferenceImage } from "@/lib/types";
import { imageGenerateAdapter } from "./image-generate";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export { FLUX3_IMAGE_OPERATION };

export type Flux3ImageRouteBody = Flux3ImageRequest & {
  apiKey?: string;
  title?: string;
  operation?: string;
  /** Library ids behind the references or the edit source, for provenance. */
  sourceAssetIds?: string[];
  /** Reference slots as the gallery stores them, so a result can show its references again. */
  referenceMeta?: Array<Partial<ReferenceImage>>;
};

const MODES: Flux3ImageMode[] = ["t2i", "i2i", "edit", "precise"];

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)) : [];
}

/** BFL: each image is "256 × 256 px to 16 MP"; its pricing page counts a megapixel as 1024 × 1024. */
const MIN_IMAGE_SIDE = 256;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;

/**
 * Names an image the API is documented to refuse, before anything is sent.
 * Only images held as base64 are measured: BFL fetches a URL itself, and an
 * image that cannot be measured here is left for BFL to judge.
 */
async function imageSizeBlocker(image: string, position: number) {
  if (/^https?:/i.test(image)) return null;
  const size = await sharp(Buffer.from(image, "base64"), { failOn: "none", limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
    .metadata()
    .catch(() => null);
  if (!size?.width || !size.height) return null;
  const measured = `Image ${position} is ${size.width} × ${size.height}`;
  if (size.width < MIN_IMAGE_SIDE || size.height < MIN_IMAGE_SIDE) {
    return `${measured}; FLUX 3 Image needs at least ${MIN_IMAGE_SIDE} × ${MIN_IMAGE_SIDE}.`;
  }
  if (size.width * size.height > MAX_IMAGE_PIXELS) {
    return `${measured}, over FLUX 3 Image's limit of 16 megapixels per image. Downscale it first.`;
  }
  return null;
}

/** Gallery ids, local outputs and data URLs become what the API takes: an http(s) URL or raw base64. */
async function resolveImages(values: string[], origin: string) {
  return Promise.all(values.map(async (value) => normalizeImageInput(await resolveImageInput(value, origin)) || ""));
}

/** The request with every image swapped for its resolved form, so `ref_image_N` still lines up. */
function withResolvedImages(request: Flux3ImageRequest, inputs: string[], resolved: string[]): Flux3ImageRequest {
  const lookup = new Map(inputs.map((value, index) => [value, resolved[index]]));
  if (request.mode === "i2i") return { ...request, references: resolved };
  return {
    ...request,
    source: request.source ? lookup.get(request.source) ?? request.source : undefined,
    regions: request.regions?.map((region) => (region.reference ? { ...region, reference: lookup.get(region.reference) } : region))
  };
}

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as Flux3ImageRouteBody;
  if (!MODES.includes(body.mode)) return { error: "mode must be t2i, i2i, edit or precise.", status: 400 };
  const request: Flux3ImageRequest = {
    mode: body.mode,
    prompt: body.prompt,
    references: stringList(body.references),
    source: typeof body.source === "string" ? body.source : undefined,
    mask: typeof body.mask === "string" && body.mask ? body.mask : undefined,
    regions: normalizeRequestBoxes(body.regions),
    layout: normalizeRequestBoxes(body.layout),
    frame: normalizeFrame(body.frame),
    settings: normalizeFlux3ImageSettings(body.settings)
  };
  const blocker = flux3ImageRequestBlocker(request);
  if (blocker) return { error: blocker, status: 400 };

  const inputs = flux3ImageInputs(request);
  let images: string[];
  try {
    images = await resolveImages(inputs, origin);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read an input image.", status: 400 };
  }
  if (images.some((image) => !image)) return { error: "An input image could not be read.", status: 400 };
  // The dashboard's own cap on an input, shared with the image tools; BFL documents a size in pixels, checked next.
  if (images.some((image) => !/^https?:/i.test(image) && image.length > MAX_IMAGE_INPUT_BYTES)) {
    return { error: `Each image must be at most ${MAX_IMAGE_INPUT_BYTES / (1024 * 1024)} MB here.`, status: 400 };
  }
  const sizeBlocker = (await Promise.all(images.map((image, index) => imageSizeBlocker(image, index + 1)))).find(Boolean);
  if (sizeBlocker) return { error: sizeBlocker, status: 400 };
  const resolved = withResolvedImages(request, inputs, images);

  let built: ReturnType<typeof buildFlux3ImagePayload>;
  try {
    built = buildFlux3ImagePayload(resolved);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not build the FLUX 3 Image request.", status: 400 };
  }

  const prompt = String(built.payload.prompt);
  const sourceAssetIds = stringList(body.sourceAssetIds);
  return {
    kind: "image" as const,
    operation: FLUX3_IMAGE_OPERATION,
    title: body.title?.trim() || `FLUX 3 Image ${request.mode}`,
    prompt,
    endpoint: built.endpoint,
    payload: built.payload,
    sourceAssetIds: [...new Set([...sourceAssetIds, ...(body.referenceMeta || []).map((meta) => meta?.assetId)])].filter(
      (value): value is string => Boolean(value)
    ),
    // The FLUX.2 finalizer saves the result; these are the fields it reads.
    context: {
      model: FLUX3_IMAGE_MODEL,
      endpointName: built.endpoint,
      outputFormat: undefined,
      finetune: null,
      shouldUpsample: false,
      referenceCount: images.length,
      referenceWeight: undefined,
      referenceMeta: body.referenceMeta,
      flux3Image: {
        mode: request.mode,
        settings: request.settings,
        imageCount: images.length,
        boxes: request.mode === "precise" ? request.regions?.length ?? 0 : request.layout?.length ?? 0,
        frame: request.frame ?? null
      },
      // Provenance the output reader maps back onto the asset: what was edited, and how.
      metadataExtra: {
        operation: `${FLUX3_IMAGE_OPERATION}:${request.mode}`,
        sourceAssetId: request.mode === "edit" || request.mode === "precise" ? sourceAssetIds[0] ?? null : null
      }
    }
  } satisfies PreparedOperation;
}

/**
 * Saves like any FLUX image, with the mode and settings the payload alone does
 * not name, and the prompt BFL expanded the request into (including any boxes
 * the model added), in `runSettings.flux3Image`. They go in before the save, so
 * the sidecar, the PNG text chunk, the remote copy and a reloaded asset agree.
 */
async function finalize(input: OperationFinalizeInput) {
  const expandedPrompt = input.result?.result?.prompt;
  const flux3Image = {
    ...input.prepared.context.flux3Image,
    ...(typeof expandedPrompt === "string" && expandedPrompt ? { expandedPrompt } : {})
  };
  const context = { ...input.prepared.context, runSettingsExtra: { flux3Image } };
  const outcome = await imageGenerateAdapter.finalize({ ...input, prepared: { ...input.prepared, context } });
  return { ...outcome, response: { ...outcome.response, flux3Image } };
}

export const flux3ImageAdapter: OperationAdapter = {
  kind: "image",
  prepare,
  finalize,
  deliveryUrl: imageGenerateAdapter.deliveryUrl
};
