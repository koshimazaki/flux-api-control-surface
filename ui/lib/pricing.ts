import { bflModels, getBflModel } from "./provider-registry";

export const modelOptions = bflModels.map(({ value, label }) => ({ value, label }));

export function estimateTokens(text: string) {
  const compact = text.trim();
  if (!compact) return 0;
  return Math.ceil(compact.length / 4);
}

export function estimateMegapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

export function estimateMinimumCost(model: string, hasReferences: boolean) {
  const pricing = getBflModel(model)?.pricing || getBflModel("pro-preview")!.pricing;
  const credits = hasReferences ? pricing.edit : pricing.text;
  return {
    credits,
    usd: credits / 100,
    label: pricing.label,
    isEdit: hasReferences
  };
}
