"use client";

import { useMemo, useState } from "react";
import { VideoTemplateFill } from "@/components/prompt-library/template-fill";
import {
  videoPromptTemplates,
  VIDEO_PROMPT_CATEGORIES,
  type CompiledVideoPrompt
} from "@/lib/video-prompt-templates";
import type { VideoPromptCategory } from "@/lib/types";

/**
 * Starter template packs, grouped by the four video categories. Picking a
 * template opens its fill-in form; the compiled result can be used directly or
 * saved into the Video library.
 */
export type VideoTemplatePacksProps = {
  useLabel?: string;
  saveLabel?: string;
  busy?: boolean;
  onUse?: (compiled: CompiledVideoPrompt) => void;
  onSave?: (compiled: CompiledVideoPrompt) => void;
};

export function VideoTemplatePacks(props: VideoTemplatePacksProps) {
  const [category, setCategory] = useState<VideoPromptCategory>("simple");
  const [templateId, setTemplateId] = useState("");
  const templates = useMemo(() => videoPromptTemplates(category), [category]);
  const active = templates.find((template) => template.id === templateId) || null;
  const info = VIDEO_PROMPT_CATEGORIES.find((entry) => entry.id === category);

  return (
    <div className="templatePacks">
      <div className="templateCategoryRow">
        {VIDEO_PROMPT_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={category === entry.id ? "active" : ""}
            title={entry.blurb}
            onClick={() => {
              setCategory(entry.id);
              setTemplateId("");
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {info && <p className="templateCategoryBlurb">{info.blurb}</p>}

      <div className="templateList">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={template.id === templateId ? "templateChip active" : "templateChip"}
            onClick={() => setTemplateId(template.id === templateId ? "" : template.id)}
          >
            <strong>{template.name}</strong>
            <small>{template.summary}</small>
          </button>
        ))}
      </div>

      {active && (
        <VideoTemplateFill
          key={active.id}
          template={active}
          useLabel={props.useLabel}
          saveLabel={props.saveLabel}
          busy={props.busy}
          onUse={props.onUse}
          onSave={props.onSave}
        />
      )}
    </div>
  );
}
