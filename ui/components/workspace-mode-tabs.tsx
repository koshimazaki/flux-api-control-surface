import { Eraser, Fingerprint, Maximize2, Paintbrush, Sparkles } from "lucide-react";
import type { WorkspaceMode } from "@/lib/types";

const modes = [
  { id: "prompt" as const, label: "Prompt", icon: Sparkles },
  { id: "erase" as const, label: "Erase", icon: Eraser },
  { id: "inpaint" as const, label: "Inpaint", icon: Paintbrush },
  { id: "outpaint" as const, label: "Outpaint", icon: Maximize2 },
  { id: "glyphs" as const, label: "Glyphs", icon: Fingerprint }
];

type WorkspaceModeTabsProps = {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
};

export function WorkspaceModeTabs({ value, onChange }: WorkspaceModeTabsProps) {
  return (
    <div className="workspaceModeBar">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          className={value === id ? "workspaceModeButton active" : "workspaceModeButton"}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  );
}
