export const selectorVariants = ["tabs", "segmented", "raised", "icon-rail"] as const;

export type SelectorVariant = (typeof selectorVariants)[number];

export function selectorGroupClassName(variant: SelectorVariant, className?: string) {
  return ["selectorGroup", `selectorGroup-${variant}`, className].filter(Boolean).join(" ");
}

export function selectorOptionClassName(variant: SelectorVariant, selected: boolean, className?: string) {
  return ["selectorOption", `selectorOption-${variant}`, selected && "active", className].filter(Boolean).join(" ");
}
