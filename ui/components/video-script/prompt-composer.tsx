"use client";

import { useMemo } from "react";
import { Library, MessageSquareText, Save, X } from "lucide-react";
import { extractPlaceholders, placeholderLabel } from "@/lib/prompt-placeholders";
import { isStylePresetActive } from "@/lib/video-prompt-templates";
import { VideoScriptPromptPicker } from "@/components/video-script/prompt-picker";
import {
  POSITIONAL_IMAGE_CONVENTION,
  videoPromptTemplates,
  VIDEO_PROMPT_CATEGORIES,
  VIDEO_STYLE_PRESETS
} from "@/lib/video-prompt-templates";
import type { PromptRecord, VideoPromptCategory } from "@/lib/types";
import type { VideoScriptPromptMode } from "@/lib/video-script-plan";
import type { VideoScriptPromptSourceKind } from "@/lib/video-script/prompt-source";

/**
 * The Video Script prompt surface.
 *
 * Type-first, not library-first: a compact prompt-type selector loads that
 * category's starter template into one large editable field, which is the
 * source of truth for the batch. Style quick-buttons act on that field for the
 * Simple type. The grouped library browser is still here, one click away, and
 * takes over whenever the field is empty.
 */
export type VideoScriptPromptComposerProps = {
  text: string;
  category: VideoPromptCategory;
  templateId: string;
  source: VideoScriptPromptSourceKind;
  blockers: string[];
  equation: string;
  prompts: PromptRecord[];
  selectedIds: string[];
  mode: VideoScriptPromptMode;
  showLibrary: boolean;
  isSaving?: boolean;
  onTextChange: (text: string) => void;
  onCategoryChange: (category: VideoPromptCategory) => void;
  onTemplateChange: (templateId: string) => void;
  onApplyStyle: (style: string) => void;
  onRemoveBlank: (name: string) => void;
  onToggleLibrary: () => void;
  onToggle: (id: string) => void;
  onClear: () => void;
  onModeChange: (mode: VideoScriptPromptMode) => void;
  onUseLibraryPrompt: (record: PromptRecord) => void;
  onSave?: () => void;
};

export function VideoScriptPromptComposer(props: VideoScriptPromptComposerProps) {
  const templates = useMemo(() => videoPromptTemplates(props.category), [props.category]);
  const blocked = props.blockers.length > 0;

  return (
    <section className="videoScriptComposer">
      <div className="runLogHeader">
        <span>Prompt</span>
        <small>
          {props.source === "composer"
            ? "composer field drives every row"
            : props.source === "library"
            ? `${props.selectedIds.length} library ${props.selectedIds.length === 1 ? "prompt" : "prompts"}`
            : "no prompt yet"}
        </small>
      </div>

      <div className="videoScriptComposerBody">
        <div className="videoScriptTypeColumn">
          <span className="videoScriptTypeLabel">Type</span>
          {VIDEO_PROMPT_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={props.category === entry.id ? "active" : ""}
              title={`${entry.blurb} — loads its starter template into the prompt field`}
              onClick={() => props.onCategoryChange(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <button
            type="button"
            className={props.showLibrary ? "active videoScriptLibraryToggle" : "videoScriptLibraryToggle"}
            onClick={props.onToggleLibrary}
            title="Pick saved prompts from the grouped library instead"
          >
            <Library size={13} />
            Library
          </button>
        </div>

        <div className="videoScriptComposerMain">
          <div className="videoScriptTemplateRow">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={props.templateId === template.id ? "active" : ""}
                title={`${template.summary} — replaces the field with this template`}
                onClick={() => props.onTemplateChange(template.id)}
              >
                {template.name}
              </button>
            ))}
          </div>

          {props.category === "simple" && (
            <div className="videoScriptStyleRow">
              <span>Style</span>
              {VIDEO_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={isStylePresetActive(props.text, preset.value) ? "active" : ""}
                  title={`${preset.value} — click again to remove, or pick another style to swap`}
                  onClick={() => props.onApplyStyle(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {extractPlaceholders(props.text).length > 0 && (
            <div className="videoScriptBlankChips" aria-label="Unfilled blanks">
              <span>Blanks</span>
              {extractPlaceholders(props.text).map((name) => (
                <button
                  key={name}
                  type="button"
                  title={`Remove {${name}} from the prompt — the sentence tidies itself`}
                  onClick={() => props.onRemoveBlank(name)}
                >
                  {placeholderLabel(name)}
                  <X size={11} />
                </button>
              ))}
            </div>
          )}

          <textarea
            className="videoScriptPromptField"
            value={props.text}
            rows={9}
            spellCheck={false}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder={`Pick a type to load its template, or paste your own prompt in the same format. ${POSITIONAL_IMAGE_CONVENTION}`}
          />

          <p className="videoScriptComposerHint">{POSITIONAL_IMAGE_CONVENTION}</p>

          {blocked && (
            <ul className="videoScriptComposerBlocked">
              {props.blockers.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          <p className="videoScriptEquation">
            <MessageSquareText size={13} />
            {props.equation}
          </p>

          <div className="videoScriptComposerActions">
            <button type="button" onClick={() => props.onTextChange("")} disabled={!props.text.trim()}>
              Clear field
            </button>
            {props.onSave && (
              <button type="button" onClick={props.onSave} disabled={blocked || !props.text.trim() || props.isSaving}>
                <Save size={14} />
                {props.isSaving ? "Saving…" : "Save to Video library"}
              </button>
            )}
          </div>
        </div>
      </div>

      {props.showLibrary && (
        <VideoScriptPromptPicker
          prompts={props.prompts}
          selectedIds={props.selectedIds}
          mode={props.mode}
          equation={props.equation}
          composerActive={props.source === "composer"}
          onToggle={props.onToggle}
          onClear={props.onClear}
          onModeChange={props.onModeChange}
          onUsePrompt={props.onUseLibraryPrompt}
        />
      )}
    </section>
  );
}
