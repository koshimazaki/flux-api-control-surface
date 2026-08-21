"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelHeader } from "@/components/ui/panel-header";
import { VideoScriptMatrix } from "@/components/video-script/matrix";
import { VideoScriptPlanPreview } from "@/components/video-script/plan-preview";
import { VideoScriptPromptComposer } from "@/components/video-script/prompt-composer";
import { VideoScriptSettings } from "@/components/video-script/settings";
import { VideoScriptSources } from "@/components/video-script/sources";
import { videoScriptPoolAssetIds } from "@/lib/video-script/sources";
import { VideoScriptTimingTemplate } from "@/components/video-script/timing-template";
import { extractPlaceholders, removePlaceholder } from "@/lib/prompt-placeholders";
import {
  starterTemplateBody,
  videoScriptPromptSource,
  type VideoScriptPromptSourceResult
} from "@/lib/video-script/prompt-source";
import {
  toggleStylePreset,
  videoPromptTemplates,
  type CompiledVideoPrompt
} from "@/lib/video-prompt-templates";
import type { AssetCollection, AssetRecord, PromptRecord, VideoPromptCategory } from "@/lib/types";
import type { VideoScriptSettings as VideoScriptSettingsValue, VideoScriptTimingMode } from "@/lib/video-script-plan";
import {
  audioMarkerTimingTemplate,
  readAudioScriptMarkerSource,
  type AudioMarkerImportKind,
  type AudioMarkerSource
} from "@/lib/video-script/audio-markers";
import { enqueueVideoScriptPlan } from "@/lib/video-script/enqueue";
import { planVideoScriptBatch, planVideoScriptGenerator } from "@/lib/video-script/plan-input";
import * as rows from "@/lib/video-script/rows";
import {
  defaultVideoScriptEditorState,
  evenTimingTemplate,
  type VideoScriptEditorState
} from "@/lib/video-script/types";

/**
 * Video Script surface: sources, keyframe matrix, prompts, settings, timing,
 * and the live plan preview. All expansion, dedupe, validation, and cost come
 * from `video-script-plan`; this component only holds editor state and hands
 * confirmed rows to the server-owned queue.
 */
export type VideoScriptPanelProps = {
  assets: AssetRecord[];
  collections: AssetCollection[];
  prompts: PromptRecord[];
  onRefreshCollections?: () => void | Promise<unknown>;
  /** Saves the composer prompt into the Video library. */
  onSavePrompt?: (compiled: CompiledVideoPrompt) => void | Promise<unknown>;
};

function batchId() {
  return `vsb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function VideoScriptPanel(props: VideoScriptPanelProps) {
  const [state, setState] = useState<VideoScriptEditorState>(defaultVideoScriptEditorState);
  const [activePoolId, setActivePoolId] = useState("");
  const [overrideRowId, setOverrideRowId] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<AudioMarkerSource | null>(null);
  const [importNote, setImportNote] = useState("");
  const [isEnqueueing, setIsEnqueueing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // The Audio Script panel caches its markers, shots, and locks in browser
  // storage, so the import bridge reads that rather than reaching into its
  // React state. No markers cached means the Audio tab has not been used here.
  useEffect(() => {
    setAudioSource(readAudioScriptMarkerSource());
  }, []);

  const assetsById = useMemo(() => new Map(props.assets.map((asset) => [asset.id, asset])), [props.assets]);
  // The composer field outranks the library selection while it holds text, and
  // then runs as one prompt over every row.
  const promptSource: VideoScriptPromptSourceResult = useMemo(
    () =>
      videoScriptPromptSource({
        records: props.prompts,
        promptIds: state.promptIds,
        composerText: state.promptText,
        mode: state.promptMode
      }),
    [props.prompts, state.promptIds, state.promptMode, state.promptText]
  );
  const planState = useMemo(
    () => ({ ...state, promptMode: promptSource.mode }),
    [promptSource.mode, state]
  );
  const generatorPlan = useMemo(() => planVideoScriptGenerator(state), [state]);
  const batchPlan = useMemo(
    () => planVideoScriptBatch(planState, promptSource.prompts),
    [planState, promptSource.prompts]
  );
  const overrideRow = state.rows.find((row) => row.id === overrideRowId) || null;
  const sourceCollectionIds = useMemo(
    () => state.pools.map((pool) => pool.collectionId).filter((id): id is string => Boolean(id)),
    [state.pools]
  );

  const resolveAssetSource = useCallback(
    (assetId: string) => {
      const asset = assetsById.get(assetId);
      const url = asset?.imageUrl || asset?.sampleUrl || asset?.image_url || "";
      // Prefer a server-resolvable reference; never ship base64 into the queue.
      return url && !url.startsWith("data:") ? url : undefined;
    },
    [assetsById]
  );

  async function refreshCollections() {
    if (!props.onRefreshCollections) return;
    setIsRefreshing(true);
    try {
      await props.onRefreshCollections();
    } finally {
      setIsRefreshing(false);
    }
  }

  function loadCollection(collection: AssetCollection) {
    const assetIds = videoScriptPoolAssetIds(collection, props.assets);
    if (!assetIds.length) {
      setError(`${collection.name} has no resolvable image inputs.`);
      return;
    }
    setError("");
    setState((current) => {
      const poolId = `pool_${collection.id}`;
      const pools = current.pools.filter((pool) => pool.id !== poolId);
      pools.push({ id: poolId, label: collection.name, collectionId: collection.id, assetIds });
      return { ...current, pools, sequencePoolId: current.sequencePoolId || poolId };
    });
    setActivePoolId(`pool_${collection.id}`);
  }

  function duplicatePool(poolId: string) {
    setState((current) => {
      const source = current.pools.find((pool) => pool.id === poolId);
      if (!source) return current;
      let suffix = 2;
      while (current.pools.some((pool) => pool.id === `${poolId}_v${suffix}`)) suffix += 1;
      const copy = {
        ...source,
        id: `${poolId}_v${suffix}`,
        label: `${source.label} v${suffix}`,
        assetIds: [...source.assetIds]
      };
      return { ...current, pools: [...current.pools, copy] };
    });
  }

  function removePool(poolId: string) {
    setState((current) => ({
      ...current,
      pools: current.pools.filter((pool) => pool.id !== poolId),
      sequencePoolId: current.sequencePoolId === poolId ? "" : current.sequencePoolId,
      columns: current.columns.map((binding) =>
        binding.kind === "pool" && binding.poolId === poolId ? { kind: "manual" } : binding
      )
    }));
  }

  function regenerate() {
    const expanded = generatorPlan.rows.map((row) => row.assetIds);
    if (!expanded.length) {
      setError("This generator configuration produced no rows. Bind a pool to a slot first.");
      return;
    }
    setError("");
    setState((current) => {
      const outcome = rows.regenerateRows(current.rows, expanded, current.slotCount);
      setNotice(
        `Regenerated ${outcome.generated} ${outcome.generated === 1 ? "row" : "rows"}; kept ${outcome.preserved} edited.`
      );
      return { ...current, rows: outcome.rows };
    });
  }

  function setTimingMode(mode: VideoScriptTimingMode) {
    setState((current) => ({
      ...current,
      timingMode: mode,
      timingTemplate:
        mode === "timed" && current.timingTemplate.length !== current.slotCount
          ? evenTimingTemplate(current.slotCount, current.settings.duration)
          : current.timingTemplate
    }));
  }

  function importMarkers(kind: AudioMarkerImportKind) {
    if (!audioSource) {
      setImportNote("No Audio Script markers are cached in this browser yet.");
      return;
    }
    const result = audioMarkerTimingTemplate(audioSource, {
      kind,
      keyframeCount: state.slotCount,
      duration: state.settings.duration
    });
    setImportNote(result.note);
    if (result.seconds.length) setState((current) => ({ ...current, timingTemplate: result.seconds }));
  }

  /** Loads a prompt type's starter template into the composer field. */
  function loadTemplate(category: VideoPromptCategory, id?: string) {
    const templates = videoPromptTemplates(category);
    const template = (id && templates.find((entry) => entry.id === id)) || templates[0];
    setTemplateId(template?.id || "");
    setState((current) => ({
      ...current,
      promptCategory: category,
      promptText: starterTemplateBody(category, template?.id)
    }));
  }

  /** The composer field as a compiled prompt, for saving into the library. */
  function composedPrompt(): CompiledVideoPrompt {
    const text = state.promptText.trim();
    const template = videoPromptTemplates(state.promptCategory).find((entry) => entry.id === templateId);
    return {
      templateId: template?.id || `${state.promptCategory}_custom`,
      templateName: template?.name || "Video Script composer",
      category: state.promptCategory,
      text,
      tags: ["video-script"],
      values: {},
      pending: extractPlaceholders(text)
    };
  }

  async function savePrompt() {
    if (!props.onSavePrompt) return;
    const compiled = composedPrompt();
    if (compiled.pending.length) {
      setError(`Fill in ${compiled.pending.map((name) => `{${name}}`).join(", ")} before saving this prompt.`);
      return;
    }
    setIsSavingPrompt(true);
    setError("");
    try {
      const saved = await props.onSavePrompt(compiled);
      if (saved) setNotice("Saved the composer prompt to the Video library.");
      else setError("Could not save this prompt to the library — the prompts API rejected it.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this prompt.");
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function enqueue() {
    if (!batchPlan.preview.validRowCount) return;
    if (promptSource.blockers.length) {
      setError(promptSource.blockers[0]);
      return;
    }
    setIsEnqueueing(true);
    setError("");
    try {
      const outcome = await enqueueVideoScriptPlan(batchPlan, {
        batchId: batchId(),
        sourceCollectionIds,
        resolveAssetSource,
        batchLabel: "Video Script"
      });
      setNotice(
        `Queued ${outcome.jobs.length} video ${outcome.jobs.length === 1 ? "job" : "jobs"} on the server queue; they keep running with no tab open.`
      );
    } catch (enqueueError) {
      setError(enqueueError instanceof Error ? enqueueError.message : "Could not queue this batch.");
    } finally {
      setIsEnqueueing(false);
    }
  }

  return (
    <>
      <PanelHeader
        title="Video script"
        subtitle="Build repeatable FLUX 3 keyframe batches from Collections, prompts, and audio timing."
      />

      <div className="videoScriptGrid">
        <div className="videoScriptLeft">
          <VideoScriptSources
            collections={props.collections}
            assets={props.assets}
            pools={state.pools}
            activePoolId={activePoolId}
            onLoadCollection={loadCollection}
            onRemovePool={removePool}
            onDuplicatePool={duplicatePool}
            onSelectPool={setActivePoolId}
            isLoading={isRefreshing}
            onRefresh={refreshCollections}
          />
        </div>

        <div className="videoScriptCenter">
          <VideoScriptMatrix
            state={state}
            assets={assetsById}
            generatorPlan={generatorPlan}
            batchPlan={batchPlan}
            onChange={setState}
            onBindColumn={(slotIndex, binding) => setState((current) => rows.bindColumn(current, slotIndex, binding))}
            onSetSlot={(rowId, slotIndex, assetId) =>
              setState((current) => rows.setRowSlot(current, rowId, slotIndex, assetId))
            }
            onRemoveSlot={(rowId, slotIndex) => setState((current) => rows.removeRowSlot(current, rowId, slotIndex))}
            onMoveSlot={(rowId, from, to) => setState((current) => rows.moveRowSlot(current, rowId, from, to))}
            onDuplicateRow={(rowId) => setState((current) => rows.duplicateRow(current, rowId))}
            onDeleteRow={(rowId) => setState((current) => rows.deleteRow(current, rowId))}
            onResetRowEdits={(rowId) => setState((current) => rows.resetRowEdits(current, rowId))}
            onReorderRow={(from, to) => setState((current) => rows.moveRow(current, from, to))}
            onEditRowTiming={(rowId) => setOverrideRowId((current) => (current === rowId ? null : rowId))}
            onAddRow={() => setState((current) => rows.addRow(current))}
            onRegenerate={regenerate}
            onDiscardEdited={() => setState((current) => rows.clearEditedRows(current))}
            onSetSlotCount={(slotCount) => setState((current) => rows.setSlotCount(current, slotCount))}
          />

          <VideoScriptPromptComposer
            text={state.promptText}
            category={state.promptCategory}
            templateId={templateId}
            source={promptSource.source}
            blockers={promptSource.blockers}
            equation={batchPlan.preview.equation}
            prompts={props.prompts}
            selectedIds={state.promptIds}
            mode={state.promptMode}
            showLibrary={showLibrary}
            isSaving={isSavingPrompt}
            onTextChange={(promptText) => setState((current) => ({ ...current, promptText }))}
            onCategoryChange={(category) => loadTemplate(category)}
            onTemplateChange={(id) => loadTemplate(state.promptCategory, id)}
            onApplyStyle={(style) =>
              setState((current) => ({ ...current, promptText: toggleStylePreset(current.promptText, style) }))
            }
            onRemoveBlank={(name) =>
              setState((current) => ({ ...current, promptText: removePlaceholder(current.promptText, name) }))
            }
            onToggleLibrary={() => setShowLibrary((current) => !current)}
            onToggle={(id) =>
              setState((current) => ({
                ...current,
                promptIds: current.promptIds.includes(id)
                  ? current.promptIds.filter((entry) => entry !== id)
                  : [...current.promptIds, id]
              }))
            }
            onClear={() => setState((current) => ({ ...current, promptIds: [] }))}
            onModeChange={(promptMode) => setState((current) => ({ ...current, promptMode }))}
            onUseLibraryPrompt={(record) => setState((current) => ({ ...current, promptText: record.prompt }))}
            onSave={props.onSavePrompt ? () => void savePrompt() : undefined}
          />

          <div className="videoScriptControls">
            <VideoScriptSettings
              settings={state.settings}
              onChange={(settings: VideoScriptSettingsValue) => setState((current) => ({ ...current, settings }))}
              overrideRow={overrideRow}
              onOverrideChange={(override) =>
                overrideRow && setState((current) => rows.setRowSettings(current, overrideRow.id, override))
              }
            />
            <VideoScriptTimingTemplate
              mode={state.timingMode}
              template={state.timingTemplate}
              slotCount={state.slotCount}
              duration={state.settings.duration}
              overrideRow={overrideRow}
              audioAvailable={Boolean(audioSource)}
              importNote={importNote}
              onModeChange={setTimingMode}
              onTemplateChange={(timingTemplate) => setState((current) => ({ ...current, timingTemplate }))}
              onOverrideChange={(timing) =>
                overrideRow && setState((current) => rows.setRowTiming(current, overrideRow.id, timing))
              }
              onImportMarkers={importMarkers}
              onResetTemplate={() =>
                setState((current) => ({
                  ...current,
                  timingTemplate: evenTimingTemplate(current.slotCount, current.settings.duration)
                }))
              }
            />
          </div>
        </div>

        <VideoScriptPlanPreview
          plan={batchPlan}
          hardCap={state.hardCap}
          seed={state.seed}
          isEnqueueing={isEnqueueing}
          notice={notice}
          error={error}
          onHardCapChange={(hardCap) => setState((current) => ({ ...current, hardCap }))}
          onSeedChange={(seed) => setState((current) => ({ ...current, seed }))}
          onEnqueue={() => void enqueue()}
        />
      </div>
    </>
  );
}
