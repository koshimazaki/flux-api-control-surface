export const modelOptions = [
  { value: "pro-preview", label: "Pro Preview" },
  { value: "max", label: "Max" },
  { value: "pro", label: "Pro" },
  { value: "flex", label: "Flex" },
  { value: "klein-9b-preview", label: "Klein 9B" },
  { value: "klein-4b", label: "Klein 4B" }
];

const pricingMinimums: Record<string, { text: number; edit: number; label: string }> = {
  "klein-4b": { text: 1.4, edit: 1.4, label: "FLUX.2 [klein] 4B" },
  "klein-9b-preview": { text: 1.5, edit: 1.5, label: "FLUX.2 [klein] 9B" },
  "klein-9b": { text: 1.5, edit: 1.5, label: "FLUX.2 [klein] 9B" },
  "pro-preview": { text: 3, edit: 4.5, label: "FLUX.2 [pro]" },
  pro: { text: 3, edit: 4.5, label: "FLUX.2 [pro]" },
  max: { text: 7, edit: 7, label: "FLUX.2 [max]" },
  flex: { text: 6, edit: 6, label: "FLUX.2 [flex]" }
};

export function estimateTokens(text: string) {
  const compact = text.trim();
  if (!compact) return 0;
  return Math.ceil(compact.length / 4);
}

export function estimateMegapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

export function estimateMinimumCost(model: string, hasReferences: boolean) {
  const pricing = pricingMinimums[model] || pricingMinimums["pro-preview"];
  const credits = hasReferences ? pricing.edit : pricing.text;
  return {
    credits,
    usd: credits / 100,
    label: pricing.label,
    isEdit: hasReferences
  };
}
