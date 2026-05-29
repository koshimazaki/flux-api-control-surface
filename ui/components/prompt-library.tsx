import { FileJson } from "lucide-react";
import type { PromptRecord } from "@/lib/types";

type PromptLibraryProps = {
  prompts: PromptRecord[];
  activeId: string;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onBuildCombo: () => void;
  onExport: () => void;
};

export function PromptLibrary({
  prompts,
  activeId,
  selectedIds,
  onSelect,
  onToggleSelected,
  onBuildCombo,
  onExport
}: PromptLibraryProps) {
  return (
    <aside className="panel library">
      <div className="panelHeader">
        <h2>Prompt Library</h2>
        <div className="libraryActions">
          <button disabled={selectedIds.length < 2} onClick={onBuildCombo} title="Create combo prompt">
            Combo {selectedIds.length}
          </button>
          <button className="iconButton" title="Export prompts" onClick={onExport}>
            <FileJson size={17} />
          </button>
        </div>
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
