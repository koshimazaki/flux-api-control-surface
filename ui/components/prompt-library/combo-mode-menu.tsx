import { Check, ChevronDown } from "lucide-react";
import { comboModeLabels, type ComboMode } from "@/lib/prompt-combo";

const comboModes: ComboMode[] = ["morph", "hybrid", "stack"];

type ComboModeMenuProps = {
  mode: ComboMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: ComboMode) => void;
};

export function ComboModeMenu({ mode, open, onOpenChange, onModeChange }: ComboModeMenuProps) {
  return (
    <div className="comboActionMenu">
      <button
        type="button"
        className={["comboModeButton", open ? "open" : ""].filter(Boolean).join(" ")}
        title="Combo type"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{comboModeLabels[mode]}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="comboMenu">
          {comboModes.map((item) => (
            <button
              key={item}
              type="button"
              className={item === mode ? "active" : ""}
              onClick={() => {
                onModeChange(item);
                onOpenChange(false);
              }}
            >
              <span>{comboModeLabels[item]}</span>
              {item === mode && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
