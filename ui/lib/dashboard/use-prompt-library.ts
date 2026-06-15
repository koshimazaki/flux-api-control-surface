import { useEffect, useMemo, useState } from "react";
import {
  deletePromptRecord,
  restorePromptRecord,
  savePromptRecord,
  saveStandalonePromptRecord,
  upsertPromptRecord
} from "@/lib/dashboard-prompts";
import { buildComboPrompt as buildComboPromptText, comboIdFromPrompts, uniqueText } from "@/lib/prompt-combo";
import { countPairPermutations } from "@/lib/dashboard-generation";
import { ALL_PROMPT_LIBRARY_ID, buildPromptLibraryOptions, promptLibraryId } from "@/lib/prompt-library-groups";
import { formatPrompt } from "@/lib/prompt-utils";
import type { AssetRecord, BatchMode, PromptRecord } from "@/lib/types";

type UsePromptLibraryDeps = {
  setPromptText: (value: string) => void;
  setSeed: (value: string) => void;
  setBatchMode: (value: BatchMode) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
};

export function usePromptLibrary(deps: UsePromptLibraryDeps) {
  const { setPromptText, setSeed, setBatchMode, setError, setRecoveryMessage } = deps;
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activePromptLibraryId, setActivePromptLibraryId] = useState(ALL_PROMPT_LIBRARY_ID);
  const [selectedComboIds, setSelectedComboIds] = useState<string[]>([]);
  const [lastDeletedPrompt, setLastDeletedPrompt] = useState<PromptRecord | null>(null);

  const activePrompt = useMemo(() => prompts.find((prompt) => prompt.id === activeId), [activeId, prompts]);
  const promptLibraryOptions = useMemo(() => buildPromptLibraryOptions(prompts), [prompts]);
  const visiblePrompts = useMemo(
    () =>
      activePromptLibraryId === ALL_PROMPT_LIBRARY_ID
        ? prompts
        : prompts.filter((prompt) => promptLibraryId(prompt) === activePromptLibraryId),
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
  function selectPromptLibrary(id: string) {
    setActivePromptLibraryId(id);
    const nextPrompts = id === ALL_PROMPT_LIBRARY_ID
      ? prompts
      : prompts.filter((prompt) => promptLibraryId(prompt) === id);
    if (nextPrompts.length && !nextPrompts.some((prompt) => prompt.id === activeId)) {
      selectPromptRecord(nextPrompts[0]);
    }
  }
  function toggleComboPrompt(id: string) {
    setSelectedComboIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }
  function createComboPrompt() {
    const chosen = selectedComboIds
      .map((id) => prompts.find((prompt) => prompt.id === id))
      .filter(Boolean) as PromptRecord[];
    if (chosen.length < 2) return;
    const comboId = comboIdFromPrompts(chosen);
    const formattedPrompt = buildComboPromptText(chosen);
    const record: PromptRecord = {
      id: comboId,
      species: "combo",
      seed: chosen[0]?.seed,
      plant_form: uniqueText(chosen.map((item) => item.plant_form)).join(" + "),
      prompt: formattedPrompt
    };
    setPrompts((current) => [record, ...current.filter((prompt) => prompt.id !== comboId)]);
    setActiveId(record.id);
    setPromptText(formattedPrompt);
    setSeed(String(record.seed || ""));
    setSelectedComboIds([record.id]);
    setBatchMode("current");
    setError("");
  }
  async function savePrompt(activePromptText: string, seed: string, saveAsNew = false) {
    try {
      const saved = await savePromptRecord(activePrompt, activePromptText, seed, { saveAsNew });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setActivePromptLibraryId(promptLibraryId(saved));
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
      const nextVisible = activePromptLibraryId === ALL_PROMPT_LIBRARY_ID
        ? nextPrompts
        : nextPrompts.filter((prompt) => promptLibraryId(prompt) === activePromptLibraryId);
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
      setActivePromptLibraryId(promptLibraryId(restored));
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
  async function saveAssetPromptToLibrary(asset: AssetRecord) {
    if (!asset.prompt?.trim()) {
      setError("This asset has no prompt to save.");
      return;
    }
    try {
      const saved = await saveStandalonePromptRecord({
        idPrefix: `gallery_${asset.title || asset.id}`,
        domain: "gallery_prompts",
        species: asset.model,
        seed: asset.seed,
        prompt: asset.prompt
      });
      setPrompts((current) => upsertPromptRecord(current, saved));
      setRecoveryMessage(`Saved ${saved.id} to the prompt library (Gallery Prompts).`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset prompt.");
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
    lastDeletedPrompt,
    activePrompt,
    promptLibraryOptions,
    visiblePrompts,
    permutationPairCount,
    selectPromptRecord,
    selectPrompt,
    selectPromptLibrary,
    toggleComboPrompt,
    createComboPrompt,
    savePrompt,
    deletePrompt,
    undoDeletePrompt,
    importPromptJson,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    selectAllPromptSources,
    clearPromptSources
  };
}
