import { ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { WorkspaceMediaSwitch } from "@/components/workspace-media-switch";
import { comboModeLabels, type ComboSettings } from "@/lib/prompt-combo";
import type { WorkspaceMediaKind } from "@/lib/workspace-media";

type CollapsedPromptLibraryProps = {
  comboSettings: ComboSettings;
  selectedCount: number;
  mediaKind: WorkspaceMediaKind;
  onOpen: () => void;
  onMediaKindChange: (kind: WorkspaceMediaKind) => void;
};

export function CollapsedPromptLibrary({
  comboSettings,
  selectedCount,
  mediaKind,
  onOpen,
  onMediaKindChange
}: CollapsedPromptLibraryProps) {
  return (
    <aside className="panel library collapsedLibrary">
      <IconButton title="Open prompt library" onClick={onOpen}>
        <ChevronRight size={18} />
      </IconButton>
      <span>Library</span>
      <small>
        {comboModeLabels[comboSettings.mode]} {selectedCount}
      </small>
      <WorkspaceMediaSwitch value={mediaKind} onChange={onMediaKindChange} variant="rail" />
    </aside>
  );
}
