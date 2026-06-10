import type { LucideIcon } from "lucide-react";

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
};

export function TabButtonBar<T extends string>({ items, value, onChange, className, iconSize = 16 }: TabButtonBarProps<T>) {
  return (
    <div className={className ? `tabBar ${className}` : "tabBar"}>
      {items.map(({ id, label, count, icon: Icon }) => (
        <button
          className={value === id ? "tabButton active" : "tabButton"}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          <Icon size={iconSize} />
          {label}
          {typeof count === "number" && <span>{count}</span>}
        </button>
      ))}
    </div>
  );
}
