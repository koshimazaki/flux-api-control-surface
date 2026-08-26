import type { LucideIcon } from "lucide-react";
import { SelectorGroup, SelectorOption } from "@/components/ui/selector-group";

export type TabButtonItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number | null;
};

type TabButtonBarProps<T extends string> = {
  items: TabButtonItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  iconSize?: number;
  ariaLabel?: string;
};

export function TabButtonBar<T extends string>({
  items,
  value,
  onChange,
  className,
  iconSize = 16,
  ariaLabel
}: TabButtonBarProps<T>) {
  return (
    <SelectorGroup variant="tabs" className={className ? `tabBar ${className}` : "tabBar"} aria-label={ariaLabel}>
      {items.map(({ id, label, count, icon: Icon }) => (
        <SelectorOption
          variant="tabs"
          selected={value === id}
          className={["tabButton", `tabButton-${id}`].join(" ")}
          key={id}
          onClick={() => onChange(id)}
        >
          <Icon size={iconSize} />
          {label}
          {typeof count === "number" && <span>{count}</span>}
        </SelectorOption>
      ))}
    </SelectorGroup>
  );
}
