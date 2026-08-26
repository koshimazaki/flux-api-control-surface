import type { ComponentPropsWithoutRef } from "react";
import {
  selectorGroupClassName,
  selectorOptionClassName,
  type SelectorVariant
} from "@/lib/selector-variants";

type SelectorGroupProps = ComponentPropsWithoutRef<"div"> & {
  variant: SelectorVariant;
};

type SelectorOptionProps = Omit<ComponentPropsWithoutRef<"button">, "aria-pressed"> & {
  selected: boolean;
  variant: SelectorVariant;
};

export function SelectorGroup({ variant, className, role = "group", ...props }: SelectorGroupProps) {
  return (
    <div
      {...props}
      role={role}
      data-selector-variant={variant}
      className={selectorGroupClassName(variant, className)}
    />
  );
}

export function SelectorOption({
  selected,
  variant,
  className,
  type = "button",
  ...props
}: SelectorOptionProps) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      data-selector-variant={variant}
      className={selectorOptionClassName(variant, selected, className)}
    />
  );
}
