"use client";

import { Check, ChevronDown, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { surfaceThemes, type SurfaceTheme } from "@/lib/surface-theme";

type ThemePickerProps = {
  value: SurfaceTheme;
  onChange: (theme: SurfaceTheme) => void;
};

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selected = surfaceThemes.find((theme) => theme.id === value) || surfaceThemes[0];

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="themePicker" ref={pickerRef}>
      <button
        type="button"
        className="themePickerTrigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Surface theme: ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Palette size={14} />
        <span className="themePickerName visuallyHidden">{selected.label}</span>
        <ChevronDown className="themePickerChevron" size={13} />
      </button>
      {open && (
        <div className="themePickerMenu" role="listbox" aria-label="Surface theme">
          <div className="themePickerMenuLabel">Surface themes</div>
          {surfaceThemes.map((theme) => (
            <button
              type="button"
              role="option"
              aria-selected={theme.id === value}
              className={theme.id === value ? "themePickerOption active" : "themePickerOption"}
              key={theme.id}
              onClick={() => {
                onChange(theme.id);
                setOpen(false);
              }}
            >
              <span className="themePickerOptionPreview" aria-hidden="true">
                <span className="themePickerRamp">
                  {theme.surfaces.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                </span>
                <span className="themePickerSignals">
                  {theme.signals.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                </span>
              </span>
              <span className="themePickerOptionCopy">
                <strong>{theme.label}</strong>
                <small>{theme.description}</small>
              </span>
              {theme.id === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
