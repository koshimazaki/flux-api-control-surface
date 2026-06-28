export type ProviderId = "bfl";

export type ProviderModel = {
  provider: ProviderId;
  value: string;
  label: string;
  endpoint: string;
  pricing: {
    text: number;
    edit: number;
    label: string;
  };
  supportsPromptUpsampling: boolean;
  maxReferences: number;
  maxMegapixels: number;
  promptTokenLimit?: number;
  capabilities: ProviderModelCapabilities;
};

export type ProviderModelCapabilities = {
  supportsPromptUpsampling: boolean;
  maxReferences: number;
  maxMegapixels: number;
  promptTokenLimit?: number;
};

export type ProviderImageTool = {
  provider: ProviderId;
  value: "erase" | "vto" | "outpaint" | "deblur";
  label: string;
  endpoint: string;
  maxInputMegapixels?: number;
  maxCanvasMegapixels?: number;
};

export const BFL_FLUX2_API_MAX_REFERENCES = 8;
export const BFL_FLUX2_KLEIN_MAX_REFERENCES = 4;
export const BFL_MAX_MEGAPIXELS = 4;
export const BFL_FLUX2_PROMPT_TOKEN_LIMIT = 32_000;

function defineBflModel(model: Omit<ProviderModel, "capabilities">): ProviderModel {
  return {
    ...model,
    capabilities: {
      supportsPromptUpsampling: model.supportsPromptUpsampling,
      maxReferences: model.maxReferences,
      maxMegapixels: model.maxMegapixels,
      promptTokenLimit: model.promptTokenLimit
    }
  };
}

export const bflModels: ProviderModel[] = [
  defineBflModel({
    provider: "bfl",
    value: "pro-preview",
    label: "Pro Preview",
    endpoint: "flux-2-pro-preview",
    pricing: { text: 3, edit: 4.5, label: "FLUX.2 [pro]" },
    supportsPromptUpsampling: true,
    maxReferences: BFL_FLUX2_API_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "max",
    label: "Max",
    endpoint: "flux-2-max",
    pricing: { text: 7, edit: 7, label: "FLUX.2 [max]" },
    supportsPromptUpsampling: true,
    maxReferences: BFL_FLUX2_API_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "pro",
    label: "Pro",
    endpoint: "flux-2-pro",
    pricing: { text: 3, edit: 4.5, label: "FLUX.2 [pro]" },
    supportsPromptUpsampling: true,
    maxReferences: BFL_FLUX2_API_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "flex",
    label: "Flex",
    endpoint: "flux-2-flex",
    pricing: { text: 6, edit: 6, label: "FLUX.2 [flex]" },
    supportsPromptUpsampling: true,
    maxReferences: BFL_FLUX2_API_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "klein-9b-preview",
    label: "Klein 9B Preview",
    endpoint: "flux-2-klein-9b-preview",
    pricing: { text: 1.5, edit: 1.5, label: "FLUX.2 [klein] 9B" },
    supportsPromptUpsampling: false,
    maxReferences: BFL_FLUX2_KLEIN_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "klein-9b",
    label: "Klein 9B",
    endpoint: "flux-2-klein-9b",
    pricing: { text: 1.5, edit: 1.5, label: "FLUX.2 [klein] 9B" },
    supportsPromptUpsampling: false,
    maxReferences: BFL_FLUX2_KLEIN_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  }),
  defineBflModel({
    provider: "bfl",
    value: "klein-4b",
    label: "Klein 4B",
    endpoint: "flux-2-klein-4b",
    pricing: { text: 1.4, edit: 1.4, label: "FLUX.2 [klein] 4B" },
    supportsPromptUpsampling: false,
    maxReferences: BFL_FLUX2_KLEIN_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  })
];

export const bflImageTools: ProviderImageTool[] = [
  { provider: "bfl", value: "erase", label: "Erase", endpoint: "flux-tools/erase-v1" },
  { provider: "bfl", value: "vto", label: "Virtual Try-On", endpoint: "flux-tools/vto-v1" },
  {
    provider: "bfl",
    value: "outpaint",
    label: "Outpaint",
    endpoint: "flux-tools/outpainting-v1",
    maxCanvasMegapixels: BFL_MAX_MEGAPIXELS
  },
  {
    provider: "bfl",
    value: "deblur",
    label: "Deblur",
    endpoint: "flux-tools/deblur-v1",
    maxInputMegapixels: BFL_MAX_MEGAPIXELS
  }
];

const bflModelMap = new Map(bflModels.map((model) => [model.value, model]));
const bflToolMap = new Map(bflImageTools.map((tool) => [tool.value, tool]));
const bflPollFailureStatuses = new Set(["Error", "Failed", "Request Moderated", "Content Moderated", "Task not found"]);

export function getBflModel(value: string) {
  return bflModelMap.get(value);
}

export function getBflModelCapabilities(value: string) {
  return (getBflModel(value) || getBflModel("pro-preview") || bflModels[0]).capabilities;
}

export function maxReferencesForBflModel(value: string) {
  return getBflModelCapabilities(value).maxReferences;
}

export function getBflImageTool(value: ProviderImageTool["value"]) {
  return bflToolMap.get(value);
}

export function isBflPollFailureStatus(status: unknown) {
  return bflPollFailureStatuses.has(String(status));
}

export function validateBflGenerationRequest(options: {
  model: ProviderModel;
  width: number;
  height: number;
  referenceCount: number;
}) {
  if (!Number.isFinite(options.width) || !Number.isFinite(options.height)) {
    return "Width and height must be valid numbers.";
  }
  if (options.width < 64 || options.height < 64) return "Width and height must be at least 64 px.";
  if ((options.width * options.height) / 1_000_000 > options.model.maxMegapixels) {
    return `BFL ${options.model.label} output is capped at ${options.model.maxMegapixels} MP.`;
  }
  if (options.referenceCount > options.model.maxReferences) {
    return `BFL ${options.model.label} accepts up to ${options.model.maxReferences} reference images.`;
  }
  return "";
}

export function validateBflToolRequest(options: {
  tool: ProviderImageTool;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  mode?: "high" | "fast";
}) {
  if (options.tool.maxInputMegapixels) {
    const width = options.imageWidth || 0;
    const height = options.imageHeight || 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return `${options.tool.label} needs a source image with readable dimensions.`;
    }
    const megapixels = (width * height) / 1_000_000;
    if (megapixels > options.tool.maxInputMegapixels) {
      return `${options.tool.label} input is capped at ${options.tool.maxInputMegapixels} MP.`;
    }
  }
  if (options.tool.value !== "outpaint") return "";
  const width = options.canvasWidth || 0;
  const height = options.canvasHeight || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return "Outpaint width and height must be valid numbers.";
  }
  if (width < 64 || height < 64) return "Outpaint width and height must be at least 64 px.";
  const megapixels = (width * height) / 1_000_000;
  if (options.tool.maxCanvasMegapixels && megapixels > options.tool.maxCanvasMegapixels) {
    return `Outpaint canvas is capped at ${options.tool.maxCanvasMegapixels} MP.`;
  }
  if (options.mode === "fast" && /^https?:\/\//i.test(options.image || "")) {
    return "Outpaint fast mode requires a base64 image input. Use high mode for hosted URLs.";
  }
  return "";
}

// Hosted FLUX.2 [klein] finetuned inference endpoint. A registered finetune_id is
// generated against this endpoint with the same standard params as klein-9b.
export const BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT = "flux-2-klein-9b-kv-finetuned";

// Turn a finetune into a generation target. Intentionally NOT part of `bflModels`
// (so model pickers/pricing stay sourced from the base catalog); capabilities
// mirror klein-9b.
export function bflFinetunedKleinModel(): ProviderModel {
  return defineBflModel({
    provider: "bfl",
    value: "klein-9b-finetuned",
    label: "Klein 9B (finetuned)",
    endpoint: BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT,
    pricing: { text: 1.5, edit: 1.5, label: "FLUX.2 [klein] 9B finetuned" },
    supportsPromptUpsampling: false,
    maxReferences: BFL_FLUX2_KLEIN_MAX_REFERENCES,
    maxMegapixels: BFL_MAX_MEGAPIXELS,
    promptTokenLimit: BFL_FLUX2_PROMPT_TOKEN_LIMIT
  });
}
