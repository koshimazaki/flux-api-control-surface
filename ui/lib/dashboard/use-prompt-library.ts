import { useEffect, useMemo, useState } from "react";
import {
  deletePromptRecord,
  restorePromptRecord,
  savePromptRecord,
  saveStandalonePromptRecord,
  upsertPromptRecord
} from "@/lib/dashboard-prompts";
import { inferVideoCategory, VIDEO_PROMPT_DOMAIN } from "@/lib/prompt-media";
import type { CompiledVideoPrompt } from "@/lib/video-prompt-templates";
import {
  buildComboPrompt as buildComboPromptText,
  comboIdFromPrompts,
  comboModeLabels,
  comboPromptFormat,
  defaultComboSettings,
  normalizeComboMode,
  normalizeComboSettings,
  uniqueText,
  type ComboMode,
  type ComboSettings
} from "@/lib/prompt-combo";
import { countPairPermutations } from "@/lib/dashboard-generation";
import {
  ALL_PROMPT_LIBRARY_ID,
  buildPromptLibraryOptions,
  promptLibraryComboPreset,
  promptLibraryIdForRecord,
  promptLibraryLabel,
  promptMatchesLibrary
} from "@/lib/prompt-library-groups";
import { formatPrompt } from "@/lib/prompt-utils";
import type { AssetRecord, BatchMode, PromptRecord } from "@/lib/types";

type UsePromptLibraryDeps = {
  setPromptText: (value: string) => void;
  setSeed: (value: string) => void;
  setBatchMode: (value: BatchMode) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
};

const COMBO_SETTINGS_CACHE_KEY = "bfl-combo-settings";

function loadComboSettings() {
  if (typeof window === "undefined") return defaultComboSettings;
  try {
    return normalizeComboSettings(JSON.parse(window.localStorage.getItem(COMBO_SETTINGS_CACHE_KEY) || "null"));
  } catch {
    return defaultComboSettings;
  }
}

function persistComboSettings(settings: ComboSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMBO_SETTINGS_CACHE_KEY, JSON.stringify(settings));
}

export function usePromptLibrary(deps: UsePromptLibraryDeps) {
  const { setPromptText, setSeed, setBatchMode, setError, setRecoveryMessage } = deps;
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activePromptLibraryId, setActivePromptLibraryId] = useState(ALL_PROMPT_LIBRARY_ID);
  const [selectedComboIds, setSelectedComboIds] = useState<string[]>([]);
  const [comboSettings, setComboSettingsState] = useState<ComboSettings>(defaultComboSettings);
  const [lastDeletedPrompt, setLastDeletedPrompt] = useState<PromptRecord | null>(null);

  const activePrompt = useMemo(() => prompts.find((prompt) => prompt.id === activeId), [activeId, prompts]);
  const promptLibraryOptions = useMemo(() => buildPromptLibraryOptions(prompts), [prompts]);
  const visiblePrompts = useMemo(
    () => prompts.filter((prompt) => promptMatchesLibrary(prompt, activePromptLibraryId)),
    [activePromptLibraryId, prompts]
  );
  const permutationPairCount = useMemo(
    () => countPairPermutations(selectedComboIds.length),
    [selectedComboIds.length]
  );

  function selectPromptRecord(record: PromptRecord) {
    setActiveId(record.id);
    setPromptText(formatPrompt(record.prompt));
    setSeed(String(record.seed || ""));
  }
  function selectPrompt(id: string) {
    const record = prompts.find((item) => item.id === id);
    if (record) selectPromptRecord(record);
  }
  function applyPromptLibraryComboPreset(id: string) {
    const preset = promptLibraryComboPreset(id);
    if (!preset) return;
    const normalized = normalizeComboSettings(preset);
    setComboSettingsState(normalized);
    persistComboSettings(normalized);
    setRecoveryMessage(`Loaded ${promptLibraryLabel(id)} combo settings.`);
    setError("");
  }
  function selectPromptLibrary(id: string) {
    setActivePromptLibraryId(id);
    const nextPrompts = prompts.filter((prompt) => promptMatchesLibrary(prompt, id));
    if (nextPrompts.length && !nextPrompts.some((prompt) => prompt.id === activeId)) {
      selectPromptRecord(nextPrompts[0]);
    }
    applyPromptLibraryComboPreset(id);
  }
  function toggleComboPrompt(id: string) {
    setSelectedComboIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }
  function saveComboSettings(settings: Partial<ComboSettings>) {
    const normalized = normalizeComboSettings(settings);
    setComboSettingsState(normalized);
    persistComboSettings(normalized);
    setRecoveryMessage("Saved combo settings.");
    setError("");
  }
  function updateComboMode(mode: ComboMode) {
    const normalized = normalizeComboSettings({ ...comboSettings, mode: normalizeComboMode(mode) });
    setComboSettingsState(normalized);
    persistComboSettings(normalized);
    setRecoveryMessage(`${comboModeLabels[normalized.mode]} combo mode selected.`);
    setError("");
  }
  function updateComboEnvironment(environment: string) {
    const normalized = normalizeComboSettings({ ...comboSettings, environment });
    setComboSettingsState(normalized);
    persistComboSettings(normalized);
    setError("");
  }
  function createComboPrompt() {
    const chosen = selectedComboIds
      .map((id) => prompts.find((prompt) => prompt.id === id))
      .filter(Boolean) as PromptRecord[];
    if (chosen.length < 2) return;
    const comboId = comboIdFromPrompts(chosen, `combo_${comboSettings.mode}`);
    const formattedPrompt = buildComboPromptText(chosen, { mode: comboSettings.mode, settings: comboSettings });
    const record: PromptRecord = {
      id: comboId,
      species: "combo",
      seed: chosen[0]?.seed,
      plant_form: uniqueText(chosen.map((item) => item.plant_form)).join(" + "),
      prompt_format: comboPromptFormat(comboSettings.mode),
      prompt: formattedPrompt,
      combo: { mode: comboSettings.mode, sources: chosen.map((item) => item.id) }
    };
    setPrompts((current) => [record, ...current.filter((prompt) => prompt.id !== comboId)]);
    setActiveId(record.id);
    setPromptText(formattedPrompt);
    setSeed(String(record.seed || ""));
    setSelectedComboIds([record.id]);
    setBatchMode("current");
    setError("");
  }
  function resetComboPrompt() {
    const activePrompt = prompts.find((prompt) => prompt.id === activeId);
    const fallback =
      prompts.find((prompt) => prompt.id !== activeId && prompt.species !== "combo" && prompt.species !== "permutation") ||
      prompts.find((prompt) => prompt.id !== activeId) ||
      prompts[0];
    setSelectedComboIds([]);
    setBatchMode("current");
    if (activePrompt?.species === "combo" || activePrompt?.species === "permutation" || activePrompt?.id.startsWith("combo_")) {
      if (fallback) selectPromptRecord(fallback);
    }
    setRecoveryMessage("Cleared combo selection.");
    setError("");
  }
  async function savePrompt(activePromptText: string, seed: string, saveAsNew = false) {
    try {
      const saved = await savePromptRecord(activePrompt, activePromptText, seed, { saveAsNew });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setActivePromptLibraryId(promptLibraryIdForRecord(saved));
      selectPromptRecord(saved);
      setRecoveryMessage(
        saveAsNew
          ? `Saved ${saved.id} as a new prompt.`
          : `Saved ${saved.id} to cybernetic_flower_flux2_prompts.json.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prompt.");
    }
  }
  async function deletePrompt() {
    if (!activePrompt?.id) return;
    const id = activePrompt.id;
    const snapshot = activePrompt;
    try {
      const { record } = await deletePromptRecord(id);
      const nextPrompts = prompts.filter((prompt) => prompt.id !== id);
      const nextVisible = nextPrompts.filter((prompt) => promptMatchesLibrary(prompt, activePromptLibraryId));
      const replacement = nextVisible[0] || nextPrompts[0];
      setPrompts(nextPrompts);
      setSelectedComboIds((current) => current.filter((item) => item !== id));
      if (replacement) {
        selectPromptRecord(replacement);
      } else {
        setActiveId("");
        setPromptText("");
        setSeed("");
      }
      setLastDeletedPrompt(record || snapshot);
      setRecoveryMessage(`Deleted ${id}. Archived to deleted_prompts.json — undo to restore it.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete prompt.");
    }
  }
  async function undoDeletePrompt() {
    if (!lastDeletedPrompt) return;
    try {
      const restored = await restorePromptRecord(lastDeletedPrompt);
      setPrompts((current) => upsertPromptRecord(current, restored));
      setActivePromptLibraryId(promptLibraryIdForRecord(restored));
      selectPromptRecord(restored);
      setLastDeletedPrompt(null);
      setRecoveryMessage(`Restored ${restored.id}.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore prompt.");
    }
  }
  function importPromptJson(promptText: string) {
    try {
      const parsed = JSON.parse(promptText);
      const records = (Array.isArray(parsed) ? parsed : [parsed]).map((item, index) => ({
        id: item.id || `imported_${index + 1}`,
        species: item.species,
        seed: item.seed,
        prompt: typeof item.prompt === "string" ? item.prompt : JSON.stringify(item)
      }));
      setPrompts(records);
      if (records[0]) selectPromptRecord(records[0]);
      setError("");
    } catch {
      setError("The prompt JSON did not parse.");
    }
  }
  async function saveSequencePrompt(promptValue: string) {
    const trimmed = promptValue.trim();
    if (!trimmed) {
      setError("Generate an audio sequence prompt first.");
      return;
    }
    try {
      const saved = await saveStandalonePromptRecord({
        idPrefix: "audio_sequence",
        domain: "audio_sequences",
        species: "audio_sequence",
        prompt: trimmed
      });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setRecoveryMessage(`Saved ${saved.id} to the prompt library (Audio Sequences).`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the sequence prompt.");
    }
  }
  /**
   * Gallery save. A FLUX 3 video asset defaults to the Video library with its
   * category inferred from the prompt (timed beats, dialogue, detail), so video
   * prompts never land in the image groups. Image assets keep the old behavior.
   */
  async function saveAssetPromptToLibrary(asset: AssetRecord) {
    if (!asset.prompt?.trim()) {
      setError("This asset has no prompt to save.");
      return;
    }
    const isVideo = asset.mediaType === "video" || String(asset.model || "").includes("flux-3-video");
    try {
      const saved = await saveStandalonePromptRecord({
        idPrefix: isVideo ? `video_${asset.title || asset.id}` : `gallery_${asset.title || asset.id}`,
        domain: isVideo ? VIDEO_PROMPT_DOMAIN : "gallery_prompts",
        species: asset.model,
        seed: asset.seed,
        prompt: asset.prompt,
        media: isVideo
          ? { mediaType: "video", videoCategory: inferVideoCategory(asset.prompt), tags: ["from-asset"] }
          : undefined
      });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setActivePromptLibraryId(promptLibraryIdForRecord(saved));
      setRecoveryMessage(
        isVideo
          ? `Saved ${saved.id} to the Video prompt library (${promptLibraryLabel(promptLibraryIdForRecord(saved))}).`
          : `Saved ${saved.id} to the prompt library (Gallery Prompts).`
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset prompt.");
    }
  }

  /**
   * Saves a compiled template (or any hand-built video prompt) into the Video
   * library. Refuses a prompt that still has `{placeholder}` blanks: the same
   * guard the planner enforces, applied before anything is persisted.
   */
  /**
   * Merges an externally saved record (e.g. an Evaluate-tab promotion) into
   * the in-session library so it is selectable without a page reload.
   */
  function mergeExternalPromptRecord(record: PromptRecord) {
    setPrompts((current) => upsertPromptRecord(current, record));
  }

  async function saveVideoPromptToLibrary(compiled: CompiledVideoPrompt) {
    if (compiled.pending.length) {
      setError(`Fill in ${compiled.pending.map((name) => `{${name}}`).join(", ")} before saving this prompt.`);
      return null;
    }
    try {
      const saved = await saveStandalonePromptRecord({
        idPrefix: `video_${compiled.templateId}`,
        domain: VIDEO_PROMPT_DOMAIN,
        species: "video_prompt",
        prompt: compiled.text,
        media: {
          mediaType: "video",
          videoCategory: compiled.category,
          tags: compiled.tags,
          videoStructure: compiled.structure,
          provenance: { templateId: compiled.templateId, capturedAt: new Date().toISOString() }
        }
      });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setActivePromptLibraryId(promptLibraryIdForRecord(saved));
      setRecoveryMessage(`Saved ${saved.id} to ${promptLibraryLabel(promptLibraryIdForRecord(saved))}.`);
      setError("");
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the video prompt.");
      return null;
    }
  }
  function selectAllPromptSources() {
    setSelectedComboIds(prompts.map((prompt) => prompt.id));
    setBatchMode("permutations");
    setError("");
  }
  function clearPromptSources() {
    setSelectedComboIds([]);
    setError("");
  }

  useEffect(() => {
    setComboSettingsState(loadComboSettings());
  }, []);

  useEffect(() => {
    fetch("/api/prompts")
      .then((response) => response.json())
      .then((records: PromptRecord[]) => {
        setPrompts(records);
        if (records[0]) selectPromptRecord(records[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load prompts"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    prompts,
    setPrompts,
    activeId,
    activePromptLibraryId,
    selectedComboIds,
    comboSettings,
    lastDeletedPrompt,
    activePrompt,
    promptLibraryOptions,
    visiblePrompts,
    permutationPairCount,
    selectPromptRecord,
    selectPrompt,
    selectPromptLibrary,
    toggleComboPrompt,
    saveComboSettings,
    updateComboMode,
    updateComboEnvironment,
    createComboPrompt,
    resetComboPrompt,
    savePrompt,
    deletePrompt,
    undoDeletePrompt,
    importPromptJson,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    saveVideoPromptToLibrary,
    mergeExternalPromptRecord,
    selectAllPromptSources,
    clearPromptSources
  };
}
