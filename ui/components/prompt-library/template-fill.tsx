"use client";

import { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { placeholderLabel } from "@/lib/prompt-placeholders";
import {
  compileVideoPromptTemplate,
  videoTemplatePlaceholders,
  VIDEO_STYLE_PRESETS,
  type CompiledVideoPrompt,
  type VideoPromptTemplate
} from "@/lib/video-prompt-templates";

/**
 * Fill-in-the-blanks authoring for one starter template.
 *
 * Every `{placeholder}` becomes a small labeled input; the compiled prompt is
 * shown live. Simple-category templates also get one-click style buttons that
 * fill `{style}`. Nothing can be used or saved while a blank remains — the same
 * rule the planner enforces, applied at the moment of authoring.
 */
export type VideoTemplateFillProps = {
  template: VideoPromptTemplate;
  useLabel?: string;
  saveLabel?: string;
  busy?: boolean;
  onUse?: (compiled: CompiledVideoPrompt) => void;
  onSave?: (compiled: CompiledVideoPrompt) => void;
};

export function VideoTemplateFill(props: VideoTemplateFillProps) {
  const { template } = props;
  const [values, setValues] = useState<Record<string, string>>({});
  const placeholders = useMemo(() => videoTemplatePlaceholders(template), [template]);
  const compiled = useMemo(() => compileVideoPromptTemplate(template, values), [template, values]);
  const blocked = compiled.pending.length > 0;

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="templateFill">
      <p className="templateFillSummary">{template.summary}</p>

      {template.category === "simple" && placeholders.includes("style") && (
        <div className="templateStyleButtons">
          {VIDEO_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={values.style === preset.value ? "active" : ""}
              title={preset.value}
              onClick={() => setValue("style", preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="templateFillFields">
        {placeholders.map((name) => (
          <label key={name} className="templateFillField">
            <span>{placeholderLabel(name)}</span>
            <input
              value={values[name] || ""}
              placeholder={template.hints?.[name] || `{${name}}`}
              onChange={(event) => setValue(name, event.target.value)}
            />
          </label>
        ))}
        {!placeholders.length && <p className="templateFillSummary">This template has no blanks to fill.</p>}
      </div>

      <pre className="templateFillPreview">{compiled.text}</pre>

      {blocked && (
        <p className="templateFillBlocked">
          Fill {compiled.pending.map((name) => `{${name}}`).join(", ")} before this prompt can be used.
        </p>
      )}

      <div className="templateFillActions">
        {props.onUse && (
          <button type="button" disabled={blocked || props.busy} onClick={() => props.onUse?.(compiled)}>
            <Wand2 size={14} />
            {props.useLabel || "Use prompt"}
          </button>
        )}
        {props.onSave && (
          <button type="button" disabled={blocked || props.busy} onClick={() => props.onSave?.(compiled)}>
            {props.saveLabel || "Save to Video library"}
          </button>
        )}
      </div>
    </div>
  );
}
