import { ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { comboModeLabels, type ComboSettings } from "@/lib/prompt-combo";

type CollapsedPromptLibraryProps = {
  comboSettings: ComboSettings;
  selectedCount: number;
  onOpen: () => void;
};

export function CollapsedPromptLibrary({ comboSettings, selectedCount, onOpen }: CollapsedPromptLibraryProps) {
  return (
    <aside className="panel library collapsedLibrary">
      <IconButton title="Open prompt library" onClick={onOpen}>
        <ChevronRight size={18} />
      </IconButton>
      <span>Library</span>
      <small>
        {comboModeLabels[comboSettings.mode]} {selectedCount}
      </small>
    </aside>
  );
}
