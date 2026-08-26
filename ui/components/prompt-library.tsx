"use client";

import { useState } from "react";
import { ChevronLeft, LayoutTemplate } from "lucide-react";
import { CollapsedPromptLibrary } from "@/components/prompt-library/collapsed-prompt-library";
import { PromptLibraryControls } from "@/components/prompt-library/prompt-library-controls";
import { VideoTemplatePacks } from "@/components/prompt-library/template-packs";
import { IconButton } from "@/components/ui/icon-button";
import { PanelHeader } from "@/components/ui/panel-header";
import { comboModeLabels, type ComboMode, type ComboSettings } from "@/lib/prompt-combo";
import type { PromptLibraryOption } from "@/lib/prompt-library-groups";
import type { CompiledVideoPrompt } from "@/lib/video-prompt-templates";
import type { PromptRecord } from "@/lib/types";
import type { WorkspaceMediaKind } from "@/lib/workspace-media";

type PromptLibraryProps = {
  prompts: PromptRecord[];
  libraryOptions: PromptLibraryOption[];
  activeLibraryId: string;
  activeId: string;
  selectedIds: string[];
  comboSettings: ComboSettings;
  mediaKind: WorkspaceMediaKind;
  collapsed?: boolean;
  canCollapse?: boolean;
  onLibraryChange: (id: string) => void;
  onMediaKindChange: (kind: WorkspaceMediaKind) => void;
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onComboModeChange: (mode: ComboMode) => void;
  onComboSettingsSave: (settings: ComboSettings) => void;
  onClearCombo: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onBuildCombo: () => void;
  onExport: () => void;
  /** Loads a compiled template into the prompt editor. */
  onUseTemplatePrompt?: (compiled: CompiledVideoPrompt) => void;
  /** Saves a compiled template into the Video library. */
  onSaveTemplatePrompt?: (compiled: CompiledVideoPrompt) => void;
};

const GROUP_LABELS: Record<string, string> = {
  media: "Library",
  domain: "Collections"
};

export function PromptLibrary({
  prompts,
  libraryOptions,
  activeLibraryId,
  activeId,
  selectedIds,
  comboSettings,
  mediaKind,
  collapsed,
  canCollapse,
  onLibraryChange,
  onMediaKindChange,
  onSelect,
  onToggleSelected,
  onComboModeChange,
  onComboSettingsSave,
  onClearCombo,
  onCollapsedChange,
  onBuildCombo,
  onExport,
  onUseTemplatePrompt,
  onSaveTemplatePrompt
}: PromptLibraryProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const canShowTemplates = Boolean(onUseTemplatePrompt || onSaveTemplatePrompt);
  const mediaOptions = libraryOptions.filter((option) => option.kind === "media");
  const domainOptions = libraryOptions.filter((option) => option.kind === "domain");
  const allOption = libraryOptions.find((option) => option.kind === "all");

  if (collapsed) {
    return (
      <CollapsedPromptLibrary
        comboSettings={comboSettings}
        selectedCount={selectedIds.length}
        mediaKind={mediaKind}
        onOpen={() => onCollapsedChange?.(false)}
        onMediaKindChange={onMediaKindChange}
      />
    );
  }

  return (
    <aside className="panel library">
      <PanelHeader title="Prompt Library">
        <div className="libraryHeaderActions">
          {canShowTemplates && (
            <IconButton
              title={showTemplates ? "Back to saved prompts" : "Video prompt templates"}
              onClick={() => setShowTemplates((current) => !current)}
            >
              <LayoutTemplate size={17} />
            </IconButton>
          )}
          {canCollapse && (
            <IconButton title="Collapse prompt library" onClick={() => onCollapsedChange?.(true)}>
              <ChevronLeft size={17} />
            </IconButton>
          )}
        </div>
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
          {allOption && (
            <option key={allOption.id} value={allOption.id}>
              {allOption.label} ({allOption.count})
            </option>
          )}
          <optgroup label={GROUP_LABELS.media}>
            {mediaOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.count})
              </option>
            ))}
          </optgroup>
          <optgroup label={GROUP_LABELS.domain}>
            {domainOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.count})
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      {showTemplates ? (
        <div className="promptList templatePanel">
          <VideoTemplatePacks
            useLabel="Load into editor"
            onUse={
              onUseTemplatePrompt
                ? (compiled) => {
                    onUseTemplatePrompt(compiled);
                    setShowTemplates(false);
                  }
                : undefined
            }
            onSave={onSaveTemplatePrompt}
          />
        </div>
      ) : (
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
      )}
    </aside>
  );
}
