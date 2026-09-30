import type { LucideIcon } from "lucide-react";

export type ToolOption<T extends string> = { id: T; label: string; icon: LucideIcon };

type ToolPickerProps<T extends string> = {
  label: string;
  options: ToolOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of equal tool buttons: brush, lasso, eraser, box. */
export function ToolPicker<T extends string>({ label, options, value, onChange }: ToolPickerProps<T>) {
  return (
    <div className="flux3ImageTools" role="group" aria-label={label}>
      {options.map(({ id, label: name, icon: Icon }) => (
        <button type="button" key={id} className={value === id ? "active" : ""} aria-pressed={value === id} onClick={() => onChange(id)}>
          <Icon size={14} />
          {name}
        </button>
      ))}
    </div>
  );
}

export function BrushSizeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label>
      Brush size · {value}px
      <input type="range" min={4} max={160} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
