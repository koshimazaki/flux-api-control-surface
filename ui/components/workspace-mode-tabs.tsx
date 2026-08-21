import { Eraser, Fingerprint, Film, Focus, Maximize2, ScanLine, Shirt, Sparkles } from "lucide-react";
import { TabButtonBar, type TabButtonItem } from "@/components/ui/tab-button-bar";
import type { WorkspaceMode } from "@/lib/types";

const modes: TabButtonItem<WorkspaceMode>[] = [
  { id: "prompt", label: "Generate", icon: Sparkles },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "outpaint", label: "Outpaint", icon: Maximize2 },
  { id: "deblur", label: "Deblur", icon: Focus },
  { id: "vto", label: "VTO", icon: Shirt },
  { id: "flux3", label: "FLUX 3", icon: Film },
  { id: "upscale", label: "Upscale", icon: ScanLine },
  { id: "glyphs", label: "Glyphs", icon: Fingerprint }
];

type WorkspaceModeTabsProps = {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
};

export function WorkspaceModeTabs({ value, onChange }: WorkspaceModeTabsProps) {
  return <TabButtonBar items={modes} value={value} onChange={onChange} className="workspaceModeBar" iconSize={18} />;
}
