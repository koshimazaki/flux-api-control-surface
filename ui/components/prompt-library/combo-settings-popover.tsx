import { useEffect, useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  comboEnvironmentLabel,
  defaultComboSettings,
  normalizeComboEnvironmentId,
  type ComboEnvironmentOption,
  type ComboSettings
} from "@/lib/prompt-combo";

type ComboSettingsPopoverProps = {
  settings: ComboSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: ComboSettings) => void;
};

export function ComboSettingsPopover({ settings, open, onOpenChange, onSave }: ComboSettingsPopoverProps) {
  const [draftSettings, setDraftSettings] = useState<ComboSettings>(settings);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  function updateDraft(patch: Partial<ComboSettings>) {
    setDraftSettings((current) => ({ ...current, ...patch }));
  }

  function updateEnvironmentOption(index: number, patch: Partial<ComboEnvironmentOption>) {
    setDraftSettings((current) => {
      const environmentOptions = [...current.environmentOptions];
      const previous = environmentOptions[index];
      if (!previous) return current;
      const name = patch.name ?? previous.name;
      const description = patch.description ?? previous.description;
      const id = patch.id ? normalizeComboEnvironmentId(patch.id) || previous.id : previous.id;
      environmentOptions[index] = { ...previous, ...patch, id, name, description };
      return {
        ...current,
        environment: current.environment === previous.id ? id : current.environment,
        environmentOptions
      };
    });
  }

  function addEnvironmentOption() {
    setDraftSettings((current) => {
      if (current.environmentOptions.length >= 8) return current;
      const usedIds = new Set(current.environmentOptions.map((option) => option.id));
      let nextIndex = current.environmentOptions.length + 1;
      while (usedIds.has(`environment_${nextIndex}`)) nextIndex += 1;
      const option = {
        id: `environment_${nextIndex}`,
        name: `Env ${nextIndex}`,
        description: "Describe this environment"
      };
      return {
        ...current,
        environmentOptions: [...current.environmentOptions, option]
      };
    });
  }

  function removeEnvironmentOption(index: number) {
    setDraftSettings((current) => {
      if (current.environmentOptions.length <= 1) return current;
      const removed = current.environmentOptions[index];
      const environmentOptions = current.environmentOptions.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        environment: current.environment === removed?.id ? environmentOptions[0]?.id || defaultComboSettings.environment : current.environment,
        environmentOptions
      };
    });
  }

  return (
    <div className="comboActionMenu">
      <IconButton title="Combo settings" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        <Settings2 size={17} />
      </IconButton>
      {open && (
        <div className="comboSettingsPopover">
          <div className="comboSettingsCard">
            <label>
              <span>Definition</span>
              <textarea
                value={draftSettings.definition}
                onChange={(event) => updateDraft({ definition: event.target.value })}
              />
            </label>
          </div>
          <div className="comboSettingsCard comboTemplateGrid">
            <label>
              <span>A</span>
              <input
                value={draftSettings.primaryLabel}
                onChange={(event) => updateDraft({ primaryLabel: event.target.value })}
              />
            </label>
            <label>
              <span>B</span>
              <input
                value={draftSettings.secondaryLabel}
                onChange={(event) => updateDraft({ secondaryLabel: event.target.value })}
              />
            </label>
          </div>
          <div className="comboSettingsCard">
            <label>
              <span>Link</span>
              <input
                value={draftSettings.linkPhrase}
                onChange={(event) => updateDraft({ linkPhrase: event.target.value })}
              />
            </label>
          </div>
          <div className="comboSettingsCard">
            <div className="comboEnvironmentFields">
              <div className="comboSettingsCardHeader">
                <span>Environment toggles</span>
                <IconButton title="Add environment" onClick={addEnvironmentOption} disabled={draftSettings.environmentOptions.length >= 8}>
                  <Plus size={14} />
                </IconButton>
              </div>
              <div className="comboEnvironmentRows">
                {draftSettings.environmentOptions.map((option, index) => (
                  <div className="comboEnvironmentRow" key={option.id || index}>
                    <input
                      aria-label={`Environment ${index + 1} name`}
                      value={option.name}
                      onChange={(event) => updateEnvironmentOption(index, { name: event.target.value })}
                    />
                    <input
                      aria-label={`Environment ${index + 1} description`}
                      value={option.description}
                      onChange={(event) => updateEnvironmentOption(index, { description: event.target.value })}
                    />
                    <IconButton
                      title="Remove environment"
                      onClick={() => removeEnvironmentOption(index)}
                      disabled={draftSettings.environmentOptions.length <= 1}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="comboSettingsCard">
            <div className="comboEnvironmentFields">
              <span>Default environment</span>
              <div className="comboEnvironmentRadios" role="radiogroup" aria-label="Default environment">
                {draftSettings.environmentOptions.map((option) => {
                  const active = option.id === draftSettings.environment;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? "active" : ""}
                      onClick={() => updateDraft({ environment: option.id })}
                    >
                      {comboEnvironmentLabel(option)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="comboPopoverActions">
            <button type="button" onClick={() => setDraftSettings(defaultComboSettings)}>
              Defaults
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draftSettings);
                onOpenChange(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
