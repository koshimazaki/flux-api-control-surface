"use client";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ApisPanel } from "@/components/apis-panel";
import { AssetLibrary } from "@/components/asset-library";
import { BackgroundShader } from "@/components/background-shader";
import { DashboardStats } from "@/components/dashboard-stats";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { GenerationLog } from "@/components/generation-log";
import { Lightbox } from "@/components/lightbox";
import { McpPanel } from "@/components/mcp-panel";
import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
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
  composePrompt,
  executePlannedGeneration,
  fetchRunPlan,
  readReferenceFiles,
  type BatchProgress
} from "@/lib/dashboard-generation";
import { savePromptRecord, upsertPromptRecord } from "@/lib/dashboard-prompts";
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
  TrainingCollection
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
  const [selectedComboIds, setSelectedComboIds] = useState<string[]>([]);
  const [promptText, setPromptText] = useState("");
  const [referenceCue, setReferenceCue] = useState(defaultReferenceCue);
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
  const [metadataAssetId, setMetadataAssetId] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceState>({ credits: null });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isSpawningCaptionAgent, setIsSpawningCaptionAgent] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const activePrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === activeId),
    [activeId, prompts]
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
        referenceCue,
        references
      }),
    [activeId, batchCount, batchMode, height, model, promptText, promptUpsampling, referenceCue, references, seed, selectedComboIds, width]
  );
  const promptForRun = useMemo(
    () => composePrompt(promptText, references, referenceCue),
    [promptText, referenceCue, references]
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
  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      `${asset.title || ""} ${asset.prompt} ${asset.model}`.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);
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
  async function savePrompt() {
    try {
      const saved = await savePromptRecord(activePrompt, promptText, seed);
      setPrompts((current) => upsertPromptRecord(current, saved));
      selectPromptRecord(saved);
      setRecoveryMessage(`Saved ${saved.id} to cybernetic_flower_flux2_prompts.json.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prompt.");
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
  async function onReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    await addReferenceFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }
  function addReferenceUrl() {
    if (references.length >= 3) return;
    setReferences((current) => [
      ...current,
      { id: `url-${Date.now()}`, name: `Reference ${current.length + 1}`, value: "" }
    ]);
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
  async function generate() {
    if (batchMode === "permutations" && selectedComboIds.length < 2) {
      setError("Select at least two prompts before running selected permutations.");
      return;
    }
    let items;
    try {
      items = await fetchRunPlan(runPlanPayload);
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
        value: asset.imageDataUrl
      }
    ].slice(0, 3));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function downloadAssetImage(asset: AssetRecord) {
    const anchor = document.createElement("a");
    anchor.href = asset.imageDataUrl;
    anchor.download = `${downloadNameForAsset(asset)}.${extensionForAsset(asset)}`;
    anchor.click();
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
            prompts={prompts}
            activeId={activeId}
            selectedIds={selectedComboIds}
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
            onSave={savePrompt}
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
            batchProgress={batchProgress}
            references={references}
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
            onReferenceCueChange={setReferenceCue}
            onReferenceUpload={onReferenceUpload}
            onReferenceFiles={addReferenceFiles}
            onAddReferenceUrl={addReferenceUrl}
            onGenerate={generate}
          />
        </section>
        {recoveryMessage && <p className="statusLine">{recoveryMessage}</p>}
        <DashboardTabs
          activeTab={activeTab}
          assetCount={assets.length}
          runCount={runLog.length}
          collectionCount={trainingCollection.items.length}
          onTabChange={setActiveTab}
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
              onCollectionChange={setTrainingCollection}
              onAddSelectedAssets={addSelectedAssetsToCollection}
              onAddFiles={addCollectionFiles}
              onRemoveItem={removeCollectionItem}
              onCaptionChange={updateCollectionCaption}
              onExportZip={exportTrainingZip}
              onSpawnCaptionAgent={spawnCaptionAgent}
              onCopyCaptionPrompt={copyCaptionBrief}
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
