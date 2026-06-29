import { useState } from "react";
import { Combine, FileJson, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ComboModeMenu } from "@/components/prompt-library/combo-mode-menu";
import { ComboSettingsPopover } from "@/components/prompt-library/combo-settings-popover";
import type { ComboMode, ComboSettings } from "@/lib/prompt-combo";

type PromptLibraryControlsProps = {
  activeId: string;
  selectedCount: number;
  comboSettings: ComboSettings;
  onComboModeChange: (mode: ComboMode) => void;
  onComboSettingsSave: (settings: ComboSettings) => void;
  onClearCombo: () => void;
  onBuildCombo: () => void;
  onExport: () => void;
};

export function PromptLibraryControls({
  activeId,
  selectedCount,
  comboSettings,
  onComboModeChange,
  onComboSettingsSave,
  onClearCombo,
  onBuildCombo,
  onExport
}: PromptLibraryControlsProps) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="libraryActions">
      <div className="comboControlCluster">
        <ComboModeMenu
          mode={comboSettings.mode}
          open={modeMenuOpen}
          onOpenChange={(open) => {
            setModeMenuOpen(open);
            if (open) setSettingsOpen(false);
          }}
          onModeChange={onComboModeChange}
        />
        <ComboSettingsPopover
          settings={comboSettings}
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            if (open) setModeMenuOpen(false);
          }}
          onSave={onComboSettingsSave}
        />
        <IconButton title="Create combo prompt" onClick={onBuildCombo} disabled={selectedCount < 2}>
          <Combine size={16} />
        </IconButton>
        <IconButton title="Clear combo" onClick={onClearCombo} disabled={!selectedCount && !activeId.startsWith("combo_")}>
          <RotateCcw size={17} />
        </IconButton>
        <IconButton title="Export prompts" onClick={onExport}>
          <FileJson size={16} />
        </IconButton>
      </div>
    </div>
  );
}
