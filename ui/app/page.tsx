"use client";
import { useEffect, useMemo, useState } from "react";
import { ApisPanel } from "@/components/apis-panel";
import { AssetLibrary } from "@/components/asset-library";
import { AudioScriptPanel } from "@/components/audio-script-panel";
import { BackgroundShader } from "@/components/background-shader";
import { DashboardStats } from "@/components/dashboard-stats";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { GenerationLog } from "@/components/generation-log";
import { Lightbox } from "@/components/lightbox";
import { McpPanel } from "@/components/mcp-panel";
import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
import { ScriptPanel } from "@/components/script-panel";
import { TopBar } from "@/components/top-bar";
import { TrainingCollectionsPanel } from "@/components/training-collections-panel";
import { BFL_LIBRARY_KEY, RUN_LOG_KEY, stripAssetForStorage } from "@/lib/asset-storage";
import { copyText } from "@/lib/clipboard";
import {
  downloadNameForAsset,
  extensionForAsset,
  loadStoredAssets,
  persistAssetImage,
  persistAssetLibraries,
  recoverStoredAssetRecords,
  removeAssetImage,
  removeAssetImages,
  safeSetItem
} from "@/lib/dashboard-assets";
import {
  buildAssetRecord,
  buildCompleteRunLog,
  buildFailedRunLog,
  buildRunPlanPayload,
  clampBatchCount,
  clampReferenceWeight,
  composePrompt,
  countPairPermutations,
  executePlannedGeneration,
  fetchRunPlan,
  readReferenceFiles,
  weightedReferenceCue,
  type BatchProgress
} from "@/lib/dashboard-generation";
import { deletePromptRecord, savePromptRecord, upsertPromptRecord } from "@/lib/dashboard-prompts";
import { ALL_PROMPT_LIBRARY_ID, buildPromptLibraryOptions, promptLibraryId } from "@/lib/prompt-library-groups";
import { buildComboPrompt as buildComboPromptText, comboIdFromPrompts, uniqueText } from "@/lib/prompt-combo";
import { defaultReferenceCue, downloadText, formatPrompt } from "@/lib/prompt-utils";
import { estimateMegapixels, estimateMinimumCost, estimateTokens, modelOptions } from "@/lib/pricing";
import {
  captionInstructions,
  collectionItemFromAsset,
  collectionItemFromFile,
  createTrainingCollection,
  exportCollectionZip,
  TRAINING_COLLECTIONS_KEY
} from "@/lib/training-collections";
import type {
  AssetRecord,
  AspectRatio,
  BalanceState,
  BatchMode,
  DashboardTab,
  PromptRecord,
  ReferenceImage,
  RunLogEntry,
  TrainingCollection,
  TrainingCollectionItem
} from "@/lib/types";

type CaptionAgentJob = {
  status: string;
  jobDir?: string;
  error?: string;
};

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activePromptLibraryId, setActivePromptLibraryId] = useState(ALL_PROMPT_LIBRARY_ID);
  const [selectedComboIds, setSelectedComboIds] = useState<string[]>([]);
  const [promptText, setPromptText] = useState("");
  const [referenceCue, setReferenceCue] = useState(defaultReferenceCue);
  const [referenceWeight, setReferenceWeight] = useState(80);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [model, setModel] = useState("pro-preview");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState("");
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [batchCount, setBatchCount] = useState(1);
  const [batchMode, setBatchMode] = useState<BatchMode>("current");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [runLog, setRunLog] = useState<RunLogEntry[]>([]);
  const [hasLoadedAssets, setHasLoadedAssets] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("assets");
  const [searchQuery, setSearchQuery] = useState("");
  const [gridSize, setGridSize] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [trainingCollection, setTrainingCollection] = useState<TrainingCollection>(() =>
    createTrainingCollection("Cyberflower LoRA pack")
  );
  const [captionJob, setCaptionJob] = useState<CaptionAgentJob | null>(null);
  const [remoteReferenceCount, setRemoteReferenceCount] = useState<number | null>(null);
  const [metadataAssetId, setMetadataAssetId] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceState>({ credits: null });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isSpawningCaptionAgent, setIsSpawningCaptionAgent] = useState(false);
  const [isSyncingReferences, setIsSyncingReferences] = useState(false);
  const [isImportingReferences, setIsImportingReferences] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const activePrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === activeId),
    [activeId, prompts]
  );
  const promptLibraryOptions = useMemo(() => buildPromptLibraryOptions(prompts), [prompts]);
  const visiblePrompts = useMemo(
    () =>
      activePromptLibraryId === ALL_PROMPT_LIBRARY_ID
        ? prompts
        : prompts.filter((prompt) => promptLibraryId(prompt) === activePromptLibraryId),
    [activePromptLibraryId, prompts]
  );
  const effectiveReferenceCue = useMemo(
    () => weightedReferenceCue(referenceCue, referenceWeight),
    [referenceCue, referenceWeight]
  );
  const runPlanPayload = useMemo(
    () =>
      buildRunPlanPayload({
        batchMode,
        batchCount,
        activeId,
        selectedPromptIds: selectedComboIds,
        promptText,
        model,
        width,
        height,
        seed,
        promptUpsampling,
        referenceCue: effectiveReferenceCue,
        referenceWeight,
        references
      }),
    [activeId, batchCount, batchMode, effectiveReferenceCue, height, model, promptText, promptUpsampling, referenceWeight, references, seed, selectedComboIds, width]
  );
  const promptForRun = useMemo(
    () => composePrompt(promptText, references, effectiveReferenceCue),
    [promptText, effectiveReferenceCue, references]
  );
  const promptTokens = useMemo(() => estimateTokens(promptForRun), [promptForRun]);
  const costEstimate = useMemo(
    () => estimateMinimumCost(model, references.some((reference) => Boolean(reference.value))),
    [model, references]
  );
  const outputMegapixels = useMemo(() => estimateMegapixels(width, height), [width, height]);
  const batchTotalEstimate = costEstimate.credits * Math.max(1, batchCount);
  const totalActualCredits = useMemo(
    () => runLog.reduce((sum, entry) => sum + (entry.actualCredits ?? entry.creditDelta ?? 0), 0),
    [runLog]
  );
  const failedRunCount = useMemo(
    () => runLog.filter((entry) => entry.status === "failed").length,
    [runLog]
  );
  const permutationPairCount = useMemo(
    () => countPairPermutations(selectedComboIds.length),
    [selectedComboIds.length]
  );
  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      `${asset.title || ""} ${asset.prompt} ${asset.model}`.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);
  const primaryReference = references[0];
  const primaryReferenceUrl = primaryReference?.value.startsWith("data:") ? "" : primaryReference?.value || "";
  const primaryReferencePreview = primaryReference?.value || "";
  useEffect(() => {
    fetch("/api/prompts")
      .then((response) => response.json())
      .then((records: PromptRecord[]) => {
        setPrompts(records);
        if (records[0]) selectPromptRecord(records[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load prompts"));
  }, []);
  useEffect(() => {
    void refreshReferenceArchiveCount();
  }, []);
  useEffect(() => {
    try {
      const savedLog = localStorage.getItem(RUN_LOG_KEY);
      if (savedLog) setRunLog(JSON.parse(savedLog));
      const savedCollection = localStorage.getItem(TRAINING_COLLECTIONS_KEY);
      if (savedCollection) setTrainingCollection(JSON.parse(savedCollection));
    } catch {
      localStorage.removeItem(RUN_LOG_KEY);
      localStorage.removeItem(TRAINING_COLLECTIONS_KEY);
    }
    let cancelled = false;
    loadStoredAssets()
      .then((hydrated) => {
        if (!cancelled) setAssets(hydrated);
      })
      .catch(() => localStorage.removeItem(BFL_LIBRARY_KEY))
      .finally(() => {
        if (!cancelled) setHasLoadedAssets(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (hasLoadedAssets) persistAssetLibraries(assets);
  }, [assets, hasLoadedAssets]);
  useEffect(() => {
    safeSetItem(RUN_LOG_KEY, JSON.stringify(runLog.slice(0, 200)));
  }, [runLog]);
  useEffect(() => {
    safeSetItem(TRAINING_COLLECTIONS_KEY, JSON.stringify(trainingCollection));
  }, [trainingCollection]);
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
  async function savePrompt(saveAsNew = false) {
    try {
      const saved = await savePromptRecord(activePrompt, promptText, seed, { saveAsNew });
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
    try {
      await deletePromptRecord(id);
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
      setRecoveryMessage(`Deleted ${id}.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete prompt.");
    }
  }
  function importPromptJson() {
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
  async function addReferenceFiles(files: File[]) {
    const slots = Math.max(0, 3 - references.length);
    if (!slots) return;
    const loaded = await readReferenceFiles(files.slice(0, slots));
    setReferences((current) => [...current, ...loaded].slice(0, 3));
  }
  async function setPrimaryReferenceFiles(files: File[]) {
    const [loaded] = await readReferenceFiles(files.slice(0, 1));
    if (!loaded) return;
    setReferences((current) => [loaded, ...current.slice(1)].slice(0, 3));
  }
  function setPrimaryReferenceUrl(value: string) {
    setReferences((current) => {
      const rest = current.slice(1);
      const trimmed = value.trim();
      if (!trimmed) return rest;
      return [
        {
          id: current[0]?.id || `url-${Date.now()}`,
          name: current[0]?.name || "Reference 1",
          value: trimmed
        },
        ...rest
      ].slice(0, 3);
    });
  }
  function clearPrimaryReference() {
    setReferences((current) => current.slice(1));
  }
  async function checkBalance() {
    setIsCheckingBalance(true);
    try {
      const response = await fetch("/api/bfl/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not fetch balance");
      setBalance({ credits: data.credits, checkedAt: Date.now() });
    } catch (err) {
      setBalance({ credits: null, error: err instanceof Error ? err.message : "Could not fetch balance" });
    } finally {
      setIsCheckingBalance(false);
    }
  }
  async function generate(payload = runPlanPayload, mode = batchMode) {
    if (mode === "permutations" && selectedComboIds.length < 2) {
      setError("Select at least two prompts before running selected permutations.");
      return;
    }
    let items;
    try {
      items = await fetchRunPlan(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build run plan.");
      return;
    }
    if (!items.length) {
      setError("No prompts available for the batch.");
      return;
    }
    setError("");
    setIsGenerating(true);
    setActiveTab("runs");
    let failures = 0;
    try {
      for (const item of items) {
        const started = Date.now();
        setBatchProgress({ current: item.batchIndex, total: item.batchTotal });
        try {
          const data = await executePlannedGeneration(item, apiKey, references);
          const asset = buildAssetRecord(data, item, references);
          await persistAssetImage(asset.id, data.imageDataUrl);
          setAssets((current) => [asset, ...current]);
          setBalance({ credits: data.submit?.creditsAfter ?? balance.credits, checkedAt: Date.now() });
          setRunLog((current) => [buildCompleteRunLog(asset, started, item), ...current]);
        } catch (err) {
          failures += 1;
          const message = err instanceof Error ? err.message : "Generation failed";
          setRunLog((current) => [buildFailedRunLog(item, started, model, message), ...current]);
        }
      }
      setError(failures ? `${failures} of ${items.length} generations failed.` : "");
      if (!failures) setActiveTab("assets");
    } finally {
      setIsGenerating(false);
      setBatchProgress(null);
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
  async function runPermutationScript() {
    const pairCount = countPairPermutations(selectedComboIds.length);
    if (!pairCount) {
      setError("Select at least two prompt sources before running the script.");
      return;
    }
    const scriptCount = clampBatchCount(pairCount);
    const scriptPayload = buildRunPlanPayload({
      batchMode: "permutations",
      batchCount: scriptCount,
      activeId,
      selectedPromptIds: selectedComboIds,
      promptText,
      model,
      width,
      height,
      seed,
      promptUpsampling,
      referenceCue: effectiveReferenceCue,
      referenceWeight,
      references
    });
    setBatchMode("permutations");
    setBatchCount(scriptCount);
    await generate(scriptPayload, "permutations");
  }
  async function recoverStoredAssets() {
    const recovered = await recoverStoredAssetRecords(assets);
    setAssets(recovered.assets);
    setRecoveryMessage(
      recovered.added
        ? `Recovered ${recovered.added} older asset${recovered.added === 1 ? "" : "s"} from browser storage.`
        : "No additional older assets found in browser storage."
    );
    setActiveTab("assets");
  }
  function toggleFavorite(id: string) {
    setAssets((current) =>
      current.map((asset) => (asset.id === id ? { ...asset, is_favorite: !asset.is_favorite } : asset))
    );
  }
  function deleteAsset(id: string) {
    removeAssetImage(id);
    setAssets((current) => current.filter((asset) => asset.id !== id));
    setSelectedAssetIds((current) => current.filter((item) => item !== id));
    if (selectedAsset?.id === id) setSelectedAsset(null);
  }
  function sendAssetToPrompt(asset: AssetRecord) {
    setPromptText(formatPrompt(asset.prompt));
    setSeed(asset.seed ? String(asset.seed) : "");
    setModel(modelOptions.some((option) => option.value === asset.model) ? asset.model : "pro-preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function sendAssetToReference(asset: AssetRecord) {
    if (references.length >= 3) {
      setError("Reference slots are full. Remove one before adding another generated image.");
      return;
    }
    setReferences((current) => [
      ...current,
      {
        id: `asset-ref-${asset.id}-${Date.now()}`,
        name: asset.title || asset.id,
        value: asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url
      }
    ].slice(0, 3));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function downloadAssetImage(asset: AssetRecord) {
    const source = asset.imageDataUrl || asset.sampleUrl || asset.remoteImageUrl || asset.imageUrl || asset.image_url;
    if (!source) {
      setError("This image does not have a downloadable URL.");
      return;
    }

    let downloadUrl = source;
    let shouldRevoke = false;
    try {
      if (!source.startsWith("data:") && !source.startsWith("blob:")) {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not fetch image: ${response.status}`);
        downloadUrl = URL.createObjectURL(await response.blob());
        shouldRevoke = true;
      }

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${downloadNameForAsset(asset)}.${extensionForAsset(asset)}`;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (shouldRevoke) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setError("");
    } catch (err) {
      if (shouldRevoke) URL.revokeObjectURL(downloadUrl);
      setError(err instanceof Error ? err.message : "Could not download image.");
    }
  }
  function clearAssets() {
    removeAssetImages(assets);
    setAssets([]);
    setSelectedAssetIds([]);
  }
  function toggleAssetSelection(id: string) {
    setSelectedAssetIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }
  function addSelectedAssetsToCollection() {
    const chosenAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
    if (!chosenAssets.length) return;
    setTrainingCollection((current) => {
      const existingAssetIds = new Set(current.items.map((item) => item.assetId).filter(Boolean));
      const newItems = chosenAssets
        .filter((asset) => !existingAssetIds.has(asset.id))
        .map((asset) => collectionItemFromAsset(asset, current.triggerToken));
      if (!newItems.length) return current;
      return {
        ...current,
        items: [...current.items, ...newItems],
        updatedAt: Date.now()
      };
    });
    setSelectedAssetIds([]);
    setActiveTab("collections");
  }
  async function addCollectionFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newItems = await Promise.all(
      imageFiles.map((file) => collectionItemFromFile(file, trainingCollection.triggerToken))
    );
    setTrainingCollection((current) => ({
      ...current,
      items: [...current.items, ...newItems],
      updatedAt: Date.now()
    }));
    setActiveTab("collections");
  }
  async function refreshReferenceArchiveCount() {
    try {
      const response = await fetch("/api/reference-archive?limit=1000", { cache: "no-store" });
      const data = await response.json();
      setRemoteReferenceCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      setRemoteReferenceCount(null);
    }
  }
  async function syncCollectionReferences() {
    const items = trainingCollection.items.filter((item) => item.imageDataUrl);
    if (!items.length) return;
    setIsSyncingReferences(true);
    setError("");
    try {
      let uploaded = 0;
      let failed = 0;
      const collection = {
        id: trainingCollection.id,
        name: trainingCollection.name,
        triggerToken: trainingCollection.triggerToken,
        captionGuide: trainingCollection.captionGuide
      };
      for (let index = 0; index < items.length; index += 8) {
        const response = await fetch("/api/reference-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection, items: items.slice(index, index + 8) })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not sync reference folder.");
        uploaded += data.uploaded || 0;
        failed += data.failed || 0;
      }
      await refreshReferenceArchiveCount();
      setRecoveryMessage(
        failed
          ? `Synced ${uploaded} reference image${uploaded === 1 ? "" : "s"}; ${failed} failed.`
          : `Synced ${uploaded} reference image${uploaded === 1 ? "" : "s"} to Cloudflare.`
      );
      setActiveTab("collections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync reference folder.");
    } finally {
      setIsSyncingReferences(false);
    }
  }
  function referenceImportKey(item: TrainingCollectionItem) {
    return item.remoteReferenceId || item.remoteImageKey || item.assetId || `${item.source}:${item.fileName}:${item.name}`;
  }
  async function importRemoteReferences() {
    setIsImportingReferences(true);
    setError("");
    try {
      const response = await fetch("/api/reference-archive?limit=1000", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import cloud references.");
      const incoming = (Array.isArray(data.items) ? data.items : []) as TrainingCollectionItem[];
      let added = 0;
      setTrainingCollection((current) => {
        const seen = new Set(current.items.map(referenceImportKey));
        const additions = incoming.filter((item) => {
          const key = referenceImportKey(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map((item) => ({
          ...item,
          caption: item.caption || `${current.triggerToken}, `,
          addedAt: Date.now()
        }));
        added = additions.length;
        return additions.length
          ? { ...current, items: [...current.items, ...additions], updatedAt: Date.now() }
          : current;
      });
      setRemoteReferenceCount(typeof data.count === "number" ? data.count : incoming.length);
      setRecoveryMessage(
        added
          ? `Imported ${added} cloud reference image${added === 1 ? "" : "s"} into the collection.`
          : "No additional cloud references found."
      );
      setActiveTab("collections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import cloud references.");
    } finally {
      setIsImportingReferences(false);
    }
  }
  function removeCollectionItem(id: string) {
    setTrainingCollection((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
      updatedAt: Date.now()
    }));
  }
  function updateCollectionCaption(id: string, caption: string) {
    setTrainingCollection((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, caption } : item)),
      updatedAt: Date.now()
    }));
  }
  async function exportTrainingZip() {
    try {
      await exportCollectionZip(trainingCollection);
      setRecoveryMessage(`Exported ${trainingCollection.items.length} image LoRA collection ZIP.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export collection ZIP.");
    }
  }
  async function spawnCaptionAgent() {
    if (!trainingCollection.items.length) return;
    setIsSpawningCaptionAgent(true);
    setCaptionJob({ status: "Preparing caption job" });
    try {
      const response = await fetch("/api/bfl_dashboard/v1/caption_agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: trainingCollection })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare caption job");
      const status = data.mode === "spawned"
        ? `Spawned Codex caption agent${data.pid ? ` pid ${data.pid}` : ""}`
        : "Prepared caption job";
      setCaptionJob({ status, jobDir: data.jobDir });
      setActiveTab("collections");
    } catch (err) {
      setCaptionJob({ status: "Caption job failed", error: err instanceof Error ? err.message : "Could not prepare caption job" });
    } finally {
      setIsSpawningCaptionAgent(false);
    }
  }
  function copyCaptionBrief() {
    void copyText(captionInstructions(trainingCollection));
  }
  return (
    <>
      <BackgroundShader />
      <main className="shell">
        <TopBar apiKey={apiKey} onApiKeyChange={setApiKey} />
        <DashboardStats
          assetCount={assets.length}
          promptCount={prompts.length}
          selectedPromptCount={selectedComboIds.length}
          runCount={runLog.length}
          failedRunCount={failedRunCount}
          totalActualCredits={totalActualCredits}
          estimatedBatchCredits={batchTotalEstimate}
          balanceCredits={balance.credits}
          batchCount={batchCount}
          promptTokens={promptTokens}
          outputMegapixels={outputMegapixels}
          isCheckingBalance={isCheckingBalance}
          lastRunAt={runLog[0]?.timestamp}
          onCheckBalance={checkBalance}
        />
        <section className="workspace">
          <PromptLibrary
            prompts={visiblePrompts}
            libraryOptions={promptLibraryOptions}
            activeLibraryId={activePromptLibraryId}
            activeId={activeId}
            selectedIds={selectedComboIds}
            onLibraryChange={selectPromptLibrary}
            onSelect={selectPrompt}
            onToggleSelected={toggleComboPrompt}
            onBuildCombo={createComboPrompt}
            onExport={() => downloadText("bfl-flower-prompts.json", JSON.stringify(prompts, null, 2))}
          />
          <PromptEditor
            activePrompt={activePrompt}
            promptText={promptText}
            onPromptChange={setPromptText}
            onImport={importPromptJson}
            onSave={() => void savePrompt()}
            onSaveAsNew={() => void savePrompt(true)}
            onDelete={() => void deletePrompt()}
            onReset={() => setPromptText(formatPrompt(activePrompt?.prompt || promptText))}
          />
          <RunPanel
            model={model}
            width={width}
            height={height}
            seed={seed}
            promptUpsampling={promptUpsampling}
            batchCount={batchCount}
            batchMode={batchMode}
            selectedPromptCount={selectedComboIds.length}
            permutationPairCount={permutationPairCount}
            batchProgress={batchProgress}
            references={references}
            primaryReferenceUrl={primaryReferenceUrl}
            primaryReferencePreview={primaryReferencePreview}
            referenceWeight={referenceWeight}
            referenceCue={referenceCue}
            promptTokens={promptTokens}
            estimatedCredits={costEstimate.credits}
            estimatedUsd={costEstimate.usd}
            costLabel={costEstimate.label}
            isGenerating={isGenerating}
            error={error || balance.error || ""}
            onModelChange={setModel}
            onWidthChange={setWidth}
            onHeightChange={setHeight}
            onSeedChange={setSeed}
            onPromptUpsamplingChange={setPromptUpsampling}
            onBatchCountChange={(value) => setBatchCount(clampBatchCount(value))}
            onBatchModeChange={setBatchMode}
            onReferencesChange={setReferences}
            onPrimaryReferenceUrlChange={setPrimaryReferenceUrl}
            onPrimaryReferenceFiles={setPrimaryReferenceFiles}
            onClearPrimaryReference={clearPrimaryReference}
            onReferenceWeightChange={(value) => setReferenceWeight(clampReferenceWeight(value))}
            onReferenceCueChange={setReferenceCue}
            onReferenceFiles={addReferenceFiles}
            onGenerate={() => void generate()}
          />
        </section>
        {recoveryMessage && <p className="statusLine">{recoveryMessage}</p>}
        <DashboardTabs
          activeTab={activeTab}
          assetCount={assets.length}
          runCount={runLog.length}
          collectionCount={trainingCollection.items.length}
          scriptCount={permutationPairCount}
          onTabChange={setActiveTab}
          script={
            <ScriptPanel
              prompts={prompts}
              selectedIds={selectedComboIds}
              pairCount={permutationPairCount}
              estimatedCredits={costEstimate.credits * permutationPairCount}
              isGenerating={isGenerating}
              onToggleSelected={toggleComboPrompt}
              onSelectAll={selectAllPromptSources}
              onClearSelection={clearPromptSources}
              onRunScript={runPermutationScript}
            />
          }
          audio={
            <AudioScriptPanel
              assets={assets}
              collectionItems={trainingCollection.items}
              onOpenImage={setSelectedAsset}
              onUsePrompt={(value) => {
                setPromptText(value);
                setRecoveryMessage("Loaded audio shot script into the prompt editor.");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          }
          assets={
            <AssetLibrary
              assets={assets}
              filteredAssets={filteredAssets}
              searchQuery={searchQuery}
              gridSize={gridSize}
              aspectRatio={aspectRatio}
              metadataAssetId={metadataAssetId}
              selectedAssetIds={selectedAssetIds}
              onSearchChange={setSearchQuery}
              onGridSizeChange={setGridSize}
              onAspectRatioChange={setAspectRatio}
              onExport={() =>
                downloadText("bfl-flower-assets.json", JSON.stringify(assets.map(stripAssetForStorage), null, 2))
              }
              onClear={clearAssets}
              onRecover={recoverStoredAssets}
              onToggleFavorite={toggleFavorite}
              onSendToPrompt={sendAssetToPrompt}
              onSendToReference={sendAssetToReference}
              onToggleSelected={toggleAssetSelection}
              onToggleMetadata={(id) => setMetadataAssetId(metadataAssetId === id ? null : id)}
              onOpen={setSelectedAsset}
              onDownload={downloadAssetImage}
              onDelete={deleteAsset}
            />
          }
          runs={
            <GenerationLog
              entries={runLog}
              onExport={() => downloadText("bfl-run-log.json", JSON.stringify(runLog, null, 2))}
              onClear={() => setRunLog([])}
            />
          }
          collections={
            <TrainingCollectionsPanel
              collection={trainingCollection}
              selectedAssetCount={selectedAssetIds.length}
              captionJob={captionJob}
              isSpawningCaptionAgent={isSpawningCaptionAgent}
              isSyncingReferences={isSyncingReferences}
              isImportingReferences={isImportingReferences}
              remoteReferenceCount={remoteReferenceCount}
              referenceIndexUrl="/api/reference-archive?format=html"
              onCollectionChange={setTrainingCollection}
              onAddSelectedAssets={addSelectedAssetsToCollection}
              onAddFiles={addCollectionFiles}
              onRemoveItem={removeCollectionItem}
              onCaptionChange={updateCollectionCaption}
              onExportZip={exportTrainingZip}
              onSpawnCaptionAgent={spawnCaptionAgent}
              onCopyCaptionPrompt={copyCaptionBrief}
              onSyncReferences={syncCollectionReferences}
              onImportReferences={importRemoteReferences}
            />
          }
          apis={<ApisPanel captionJobPath={captionJob?.jobDir} />}
          mcp={
            <McpPanel
              model={model}
              width={width}
              height={height}
              batchCount={batchCount}
              batchMode={batchMode}
              selectedPromptIds={selectedComboIds}
              runPlanPayload={runPlanPayload}
              prompt={promptForRun}
              promptTokens={promptTokens}
              referencesCount={references.filter((reference) => Boolean(reference.value)).length}
              balance={balance}
              runLog={runLog}
            />
          }
        />
        <Lightbox
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onSendToPrompt={sendAssetToPrompt}
          onSendToReference={sendAssetToReference}
          onDownload={downloadAssetImage}
        />
      </main>
    </>
  );
}
