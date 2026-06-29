import { ChevronLeft } from "lucide-react";
import { CollapsedPromptLibrary } from "@/components/prompt-library/collapsed-prompt-library";
import { PromptLibraryControls } from "@/components/prompt-library/prompt-library-controls";
import { IconButton } from "@/components/ui/icon-button";
import { PanelHeader } from "@/components/ui/panel-header";
import { comboModeLabels, type ComboMode, type ComboSettings } from "@/lib/prompt-combo";
import type { PromptLibraryOption } from "@/lib/prompt-library-groups";
import type { PromptRecord } from "@/lib/types";

type PromptLibraryProps = {
  prompts: PromptRecord[];
  libraryOptions: PromptLibraryOption[];
  activeLibraryId: string;
  activeId: string;
  selectedIds: string[];
  comboSettings: ComboSettings;
  collapsed?: boolean;
  canCollapse?: boolean;
  onLibraryChange: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onComboModeChange: (mode: ComboMode) => void;
  onComboSettingsSave: (settings: ComboSettings) => void;
  onClearCombo: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onBuildCombo: () => void;
  onExport: () => void;
};

export function PromptLibrary({
  prompts,
  libraryOptions,
  activeLibraryId,
  activeId,
  selectedIds,
  comboSettings,
  collapsed,
  canCollapse,
  onLibraryChange,
  onSelect,
  onToggleSelected,
  onComboModeChange,
  onComboSettingsSave,
  onClearCombo,
  onCollapsedChange,
  onBuildCombo,
  onExport
}: PromptLibraryProps) {
  if (collapsed) {
    return (
      <CollapsedPromptLibrary
        comboSettings={comboSettings}
        selectedCount={selectedIds.length}
        onOpen={() => onCollapsedChange?.(false)}
      />
    );
  }

  return (
    <aside className="panel library">
      <PanelHeader title="Prompt Library">
        {canCollapse && (
          <IconButton title="Collapse prompt library" onClick={() => onCollapsedChange?.(true)}>
            <ChevronLeft size={17} />
          </IconButton>
        )}
      </PanelHeader>
      <PromptLibraryControls
        activeId={activeId}
        selectedCount={selectedIds.length}
        comboSettings={comboSettings}
        onComboModeChange={onComboModeChange}
        onComboSettingsSave={onComboSettingsSave}
        onClearCombo={onClearCombo}
        onBuildCombo={onBuildCombo}
        onExport={onExport}
      />
      <div className="libraryFilter">
        <div className="libraryFilterMeta">
          <em className="comboInlineStatus">
            {comboModeLabels[comboSettings.mode]} · {selectedIds.length} selected
          </em>
        </div>
        <select value={activeLibraryId} onChange={(event) => onLibraryChange(event.target.value)}>
          {libraryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>
      <div className="promptList">
        {prompts.map((record) => {
          const isActive = record.id === activeId;
          const isSelected = selectedIds.includes(record.id);
          return (
            <article
              key={record.id}
              title={`${record.id}${record.species ? ` - ${record.species}` : ""}`}
              className={["promptItem", isActive ? "active" : "", isSelected ? "selectedCombo" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <label className="comboCheck" title="Select for combo">
                <input type="checkbox" checked={isSelected} onChange={() => onToggleSelected(record.id)} />
              </label>
              <button className="promptSelect" onClick={() => onSelect(record.id)}>
                <span>{record.id}</span>
                <small>{record.species || record.location || "prompt"}</small>
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
