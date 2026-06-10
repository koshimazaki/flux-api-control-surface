import { Eraser, Fingerprint, Maximize2, Paintbrush, Sparkles } from "lucide-react";
import { TabButtonBar, type TabButtonItem } from "@/components/ui/tab-button-bar";
import type { WorkspaceMode } from "@/lib/types";

const modes: TabButtonItem<WorkspaceMode>[] = [
  { id: "prompt", label: "Prompt", icon: Sparkles },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "inpaint", label: "Inpaint", icon: Paintbrush },
  { id: "outpaint", label: "Outpaint", icon: Maximize2 },
  { id: "glyphs", label: "Glyphs", icon: Fingerprint }
];

type WorkspaceModeTabsProps = {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
};

export function WorkspaceModeTabs({ value, onChange }: WorkspaceModeTabsProps) {
  return <TabButtonBar items={modes} value={value} onChange={onChange} className="workspaceModeBar" iconSize={18} />;
}
