"use client";
import { useEffect, useMemo, useState } from "react";
import {
  buildAssetRecord,
  buildCompleteRunLog,
  buildFailedRunLog,
  buildRunPlanPayload,
  clampBatchCount,
  composePrompt,
  executePlannedGeneration,
  fetchRunPlan,
  type BatchProgress
} from "@/lib/dashboard-generation";
import { persistAssetImage } from "@/lib/dashboard-assets";
import {
  buildToolAssetRecord,
  buildToolFailureLogEntry,
  buildToolRequestBody,
  buildToolRunLogEntry,
  executeToolRun,
  toolRunBlocker,
  type ToolRunInput
} from "@/lib/dashboard-tools";
import { formatPrompt } from "@/lib/prompt-utils";
import { estimateMegapixels, estimateMinimumCost, estimateTokens, modelOptions } from "@/lib/pricing";
import { useAssetLibrary } from "@/lib/dashboard/use-asset-library";
import { useBalance } from "@/lib/dashboard/use-balance";
import { usePromptLibrary } from "@/lib/dashboard/use-prompt-library";
import { useReferences } from "@/lib/dashboard/use-references";
import { useTrainingCollections } from "@/lib/dashboard/use-training-collections";
import type {
  AssetBadge,
  AssetRecord,
  BatchMode,
  DashboardTab,
  WorkspaceMode
} from "@/lib/types";

const workspaceModeLabels: Record<Exclude<WorkspaceMode, "prompt">, string> = {
  erase: "Erase",
  inpaint: "Inpaint",
  outpaint: "Outpaint",
  glyphs: "Glyphs"
};

export function useDashboardState() {
  // Shared atoms consumed by more than one domain (prompt editor + run config + tool config).
  const [apiKey, setApiKey] = useState("");
  const [promptText, setPromptText] = useState("");
  const [model, setModel] = useState("pro-preview");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState("");
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [batchCount, setBatchCount] = useState(1);
  const [batchMode, setBatchMode] = useState<BatchMode>("current");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("assets");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("prompt");
  const [toolSourceAssetId, setToolSourceAssetId] = useState<string | null>(null);
  const [toolMask, setToolMask] = useState("");
  const [toolBrushSize, setToolBrushSize] = useState(48);
  const [toolDilatePixels, setToolDilatePixels] = useState(10);
  const [outpaintOffsetX, setOutpaintOffsetX] = useState("");
  const [outpaintOffsetY, setOutpaintOffsetY] = useState("");
  const [outpaintMode, setOutpaintMode] = useState<"high" | "fast">("high");
  const [audioAssignments, setAudioAssignments] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

  // Domain hooks. Destructured into the same local names the body/return already use.
  const {
    assets,
    setAssets,
    runLog,
    setRunLog,
    searchQuery,
    setSearchQuery,
    gridSize,
    setGridSize,
    aspectRatio,
    setAspectRatio,
    selectedAsset,
    setSelectedAsset,
    selectedAssetIds,
    setSelectedAssetIds,
    metadataAssetId,
    setMetadataAssetId,
    filteredAssets,
    totalActualCredits,
    failedRunCount,
    recoverStoredAssets,
    toggleFavorite,
    deleteAsset,
    toggleAssetSelection,
    clearAssets,
    downloadAssetImage
  } = useAssetLibrary({
    setActiveTab,
    setError,
    setRecoveryMessage,
    onAssetRemoved: (id) => {
      if (toolSourceAssetId === id) setToolSourceAssetId(null);
    }
  });

  const {
    references,
    setReferences,
    referenceCue,
    setReferenceCue,
    referenceWeight,
    setReferenceWeight,
    effectiveReferenceCue,
    primaryReferenceUrl,
    primaryReferencePreview,
    addReferenceFiles,
    setPrimaryReferenceFiles,
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    sendAssetToReference,
    addReferenceFromDragPayload
  } = useReferences({ assets, setError });

  const {
    prompts,
    activeId,
    activePromptLibraryId,
    selectedComboIds,
    lastDeletedPrompt,
    activePrompt,
    promptLibraryOptions,
    visiblePrompts,
    permutationPairCount,
    selectPrompt,
    selectPromptLibrary,
    toggleComboPrompt,
    createComboPrompt,
    deletePrompt,
    undoDeletePrompt,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    selectAllPromptSources,
    clearPromptSources,
    savePrompt: savePromptWithText,
    importPromptJson: importPromptJsonWithText
  } = usePromptLibrary({ setPromptText, setSeed, setBatchMode, setError, setRecoveryMessage });

  const {
    trainingCollection,
    setTrainingCollection,
    captionJob,
    remoteReferenceCount,
    isSpawningCaptionAgent,
    isSyncingReferences,
    isImportingReferences,
    addSelectedAssetsToCollection,
    addCollectionFiles,
    syncCollectionReferences,
    importRemoteReferences,
    removeCollectionItem,
    updateCollectionCaption,
    exportTrainingZip,
    spawnCaptionAgent,
    copyCaptionBrief
  } = useTrainingCollections({
    assets,
    selectedAssetIds,
    setSelectedAssetIds,
    setActiveTab,
    setError,
    setRecoveryMessage
  });

  const { balance, setBalance, isCheckingBalance, checkBalance } = useBalance(apiKey);

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
  const toolSourceAsset = useMemo(
    () => assets.find((asset) => asset.id === toolSourceAssetId) || null,
    [assets, toolSourceAssetId]
  );
  const assetBadges = useMemo(() => {
    const badges: Record<string, AssetBadge[]> = {};
    references.forEach((reference, index) => {
      if (!reference.assetId) return;
      (badges[reference.assetId] ||= []).push({ label: `ref ${index + 1}`, kind: "reference" });
    });
    Object.entries(audioAssignments).forEach(([assetId, token]) => {
      (badges[assetId] ||= []).push({ label: token, kind: "audio" });
    });
    return badges;
  }, [references, audioAssignments]);

  useEffect(() => {
    // masks are resolution-bound; drop them whenever the tool source changes
    setToolMask("");
  }, [toolSourceAssetId]);

  function savePrompt(saveAsNew = false) {
    return savePromptWithText(promptText, seed, saveAsNew);
  }
  function importPromptJson() {
    return importPromptJsonWithText(promptText);
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
  async function runPermutationScript() {
    const scriptCount = clampBatchCount(permutationPairCount);
    if (!permutationPairCount) {
      setError("Select at least two prompt sources before running the script.");
      return;
    }
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
  function sendAssetToPrompt(asset: AssetRecord) {
    setPromptText(formatPrompt(asset.prompt));
    setSeed(asset.seed ? String(asset.seed) : "");
    setModel(modelOptions.some((option) => option.value === asset.model) ? asset.model : "pro-preview");
    setWorkspaceMode("prompt");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function sendAssetToWorkspace(asset: AssetRecord, mode: Exclude<WorkspaceMode, "prompt">) {
    setToolSourceAssetId(asset.id);
    setWorkspaceMode(mode);
    setSelectedAsset(null);
    setRecoveryMessage(`Loaded ${asset.title || asset.id} in ${workspaceModeLabels[mode]}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearToolSourceAsset() {
    setToolSourceAssetId(null);
  }
  async function runWorkspaceTool() {
    if (workspaceMode === "prompt") {
      void generate();
      return;
    }
    if (workspaceMode === "glyphs") {
      setError("Glyphs has no BFL endpoint yet. A local vectorizer/Comfy provider lane is planned.");
      return;
    }
    if (!toolSourceAsset) {
      setError("Select a source image from the output library.");
      return;
    }
    const input: ToolRunInput = {
      mode: workspaceMode,
      sourceAsset: toolSourceAsset,
      apiKey,
      mask: toolMask,
      prompt: promptText,
      seed,
      dilatePixels: toolDilatePixels,
      canvasWidth: width,
      canvasHeight: height,
      offsetX: outpaintOffsetX,
      offsetY: outpaintOffsetY,
      outpaintMode
    };
    const blocker = toolRunBlocker({ mode: input.mode, mask: input.mask, prompt: input.prompt, hasSource: true });
    if (blocker) {
      setError(blocker);
      return;
    }
    setError("");
    setIsGenerating(true);
    const started = Date.now();
    try {
      const data = await executeToolRun(buildToolRequestBody(input));
      const asset = buildToolAssetRecord(data, input);
      await persistAssetImage(asset.id, data.imageDataUrl);
      setAssets((current) => [asset, ...current]);
      setBalance({ credits: data.submit?.creditsAfter ?? balance.credits, checkedAt: Date.now() });
      setRunLog((current) => [buildToolRunLogEntry(asset, started), ...current]);
      setSelectedAsset(asset);
      setRecoveryMessage(
        `${workspaceModeLabels[workspaceMode]} complete for ${toolSourceAsset.title || toolSourceAsset.id}.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool run failed";
      setRunLog((current) => [buildToolFailureLogEntry(input, started, message), ...current]);
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return {
    apiKey,
    setApiKey,
    prompts,
    activeId,
    activePromptLibraryId,
    selectedComboIds,
    promptText,
    setPromptText,
    referenceCue,
    setReferenceCue,
    referenceWeight,
    setReferenceWeight,
    references,
    setReferences,
    model,
    setModel,
    width,
    setWidth,
    height,
    setHeight,
    seed,
    setSeed,
    promptUpsampling,
    setPromptUpsampling,
    batchCount,
    setBatchCount,
    batchMode,
    setBatchMode,
    batchProgress,
    assets,
    runLog,
    setRunLog,
    activeTab,
    setActiveTab,
    workspaceMode,
    setWorkspaceMode,
    toolSourceAssetId,
    toolSourceAsset,
    toolMask,
    setToolMask,
    toolBrushSize,
    setToolBrushSize,
    toolDilatePixels,
    setToolDilatePixels,
    outpaintOffsetX,
    setOutpaintOffsetX,
    outpaintOffsetY,
    setOutpaintOffsetY,
    outpaintMode,
    setOutpaintMode,
    assetBadges,
    setAudioAssignments,
    searchQuery,
    setSearchQuery,
    gridSize,
    setGridSize,
    aspectRatio,
    setAspectRatio,
    selectedAsset,
    setSelectedAsset,
    selectedAssetIds,
    trainingCollection,
    setTrainingCollection,
    captionJob,
    lastDeletedPrompt,
    remoteReferenceCount,
    metadataAssetId,
    setMetadataAssetId,
    balance,
    isCheckingBalance,
    isSpawningCaptionAgent,
    isSyncingReferences,
    isImportingReferences,
    isGenerating,
    error,
    recoveryMessage,
    setRecoveryMessage,
    activePrompt,
    promptLibraryOptions,
    visiblePrompts,
    runPlanPayload,
    promptForRun,
    promptTokens,
    costEstimate,
    outputMegapixels,
    batchTotalEstimate,
    totalActualCredits,
    failedRunCount,
    permutationPairCount,
    filteredAssets,
    primaryReferenceUrl,
    primaryReferencePreview,
    selectPrompt,
    selectPromptLibrary,
    toggleComboPrompt,
    createComboPrompt,
    savePrompt,
    deletePrompt,
    undoDeletePrompt,
    importPromptJson,
    addReferenceFiles,
    setPrimaryReferenceFiles,
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    checkBalance,
    generate,
    selectAllPromptSources,
    clearPromptSources,
    runPermutationScript,
    recoverStoredAssets,
    toggleFavorite,
    deleteAsset,
    sendAssetToPrompt,
    sendAssetToWorkspace,
    clearToolSourceAsset,
    runWorkspaceTool,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    sendAssetToReference,
    addReferenceFromDragPayload,
    downloadAssetImage,
    clearAssets,
    toggleAssetSelection,
    addSelectedAssetsToCollection,
    addCollectionFiles,
    syncCollectionReferences,
    importRemoteReferences,
    removeCollectionItem,
    updateCollectionCaption,
    exportTrainingZip,
    spawnCaptionAgent,
    copyCaptionBrief
  };
}

export type DashboardState = ReturnType<typeof useDashboardState>;
