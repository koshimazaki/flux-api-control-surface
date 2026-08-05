import { useState } from "react";

type NumberFieldProps = {
  value: number | "";
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  title?: string;
};

/**
 * A number input that lets the user clear and retype freely. While focused it
 * holds a draft string, so deleting every digit never snaps to a clamped
 * value mid-edit; any in-range draft commits immediately so live previews
 * keep updating, and blur returns the box to the last committed value.
 */
export function NumberField(props: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function inRange(parsed: number) {
    if (!Number.isFinite(parsed)) return false;
    if (typeof props.min === "number" && parsed < props.min) return false;
    if (typeof props.max === "number" && parsed > props.max) return false;
    return true;
  }

  return (
    <input
      type="number"
      min={props.min}
      max={props.max}
      step={props.step}
      placeholder={props.placeholder}
      title={props.title}
      value={draft ?? (props.value === "" ? "" : String(props.value))}
      onFocus={() => setDraft(props.value === "" ? "" : String(props.value))}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (event.target.value.trim() !== "" && inRange(parsed)) props.onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
