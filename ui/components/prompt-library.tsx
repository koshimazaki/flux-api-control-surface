import { FileJson, Library } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { PanelHeader } from "@/components/ui/panel-header";
import type { PromptLibraryOption } from "@/lib/prompt-library-groups";
import type { PromptRecord } from "@/lib/types";

type PromptLibraryProps = {
  prompts: PromptRecord[];
  libraryOptions: PromptLibraryOption[];
  activeLibraryId: string;
  activeId: string;
  selectedIds: string[];
  onLibraryChange: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onBuildCombo: () => void;
  onExport: () => void;
};

export function PromptLibrary({
  prompts,
  libraryOptions,
  activeLibraryId,
  activeId,
  selectedIds,
  onLibraryChange,
  onSelect,
  onToggleSelected,
  onBuildCombo,
  onExport
}: PromptLibraryProps) {
  return (
    <aside className="panel library">
      <PanelHeader title="Prompt Library">
        <div className="libraryActions">
          <button disabled={selectedIds.length < 2} onClick={onBuildCombo} title="Create combo prompt">
            Combo {selectedIds.length}
          </button>
          <IconButton title="Export prompts" onClick={onExport}>
            <FileJson size={17} />
          </IconButton>
        </div>
      </PanelHeader>
      <label className="libraryFilter">
        <span>
          <Library size={15} />
          Library
        </span>
        <select value={activeLibraryId} onChange={(event) => onLibraryChange(event.target.value)}>
          {libraryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>
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
