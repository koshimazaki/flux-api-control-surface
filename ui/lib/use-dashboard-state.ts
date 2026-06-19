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
  missingPromptImageTokens,
  missingPromptReferenceRoleTokens,
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
import { referenceRoleConfig } from "@/lib/reference-roles";
import { useAssetLibrary } from "@/lib/dashboard/use-asset-library";
import { useBalance } from "@/lib/dashboard/use-balance";
import { useGlyphLabCache } from "@/lib/dashboard/use-glyph-lab-cache";
import { usePromptLibrary } from "@/lib/dashboard/use-prompt-library";
import { useReferences } from "@/lib/dashboard/use-references";
import { useToolSource, workspaceModeLabels } from "@/lib/dashboard/use-tool-source";
import { useTrainingCollections } from "@/lib/dashboard/use-training-collections";
import type {
  AssetBadge,
  AssetRecord,
  BatchMode,
  DashboardTab,
  ReferenceRole,
  WorkspaceMode,
  ApiKeyStatus
} from "@/lib/types";

export function useDashboardState() {
  // Shared atoms consumed by more than one domain (prompt editor + run config + tool config).
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptSourceAssetId, setPromptSourceAssetId] = useState<string | null>(null);
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

  function editPromptText(value: string) {
    setPromptSourceAssetId(null);
    setPromptText(value);
  }

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
    importImageAssetFiles,
    importPngMetadataFiles,
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
      if (promptSourceAssetId === id) setPromptSourceAssetId(null);
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
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    addAssetReference,
    addAssetReferences,
    setPrimaryAssetReference,
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
  } = usePromptLibrary({ setPromptText: editPromptText, setSeed, setBatchMode, setError, setRecoveryMessage });

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
  const promptSourceAsset = useMemo(
    () => assets.find((asset) => asset.id === promptSourceAssetId) || null,
    [assets, promptSourceAssetId]
  );
  const {
    glyphSettings,
    activeGlyphDraft,
    updateGlyphSettings,
    updateActiveGlyphDraft
  } = useGlyphLabCache(toolSourceAsset?.id);
  const {
    sendAssetToWorkspace,
    importToolSourceFiles,
    loadToolSourceFromDropPayload,
    clearToolSourceAsset
  } = useToolSource({
    assets,
    workspaceMode,
    setWorkspaceMode,
    setAssets,
    setToolSourceAssetId,
    setSelectedAsset,
    setError,
    setRecoveryMessage,
    importImageAssetFiles
  });
  const assetBadges = useMemo(() => {
    const badges: Record<string, AssetBadge[]> = {};
    references.forEach((reference, index) => {
      if (!reference.assetId) return;
      const role = referenceRoleConfig(reference.role, index);
      (badges[reference.assetId] ||= []).push({
        label: `${role.shortLabel} @img${index + 1}`,
        kind: "reference",
        title: `${role.label} reference ${index + 1}: ${reference.name}`
      });
    });
    Object.entries(audioAssignments).forEach(([assetId, token]) => {
      (badges[assetId] ||= []).push({ label: token, kind: "audio", title: `Audio sequence reference ${token}` });
    });
    if (promptSourceAssetId) {
      (badges[promptSourceAssetId] ||= []).push({ label: "prompt", kind: "prompt", title: "Prompt loaded in editor" });
    }
    if (toolSourceAssetId && workspaceMode !== "prompt") {
      (badges[toolSourceAssetId] ||= []).push({
        label: workspaceModeLabels[workspaceMode],
        kind: workspaceMode,
        title: `Active ${workspaceModeLabels[workspaceMode]} source`
      });
    }
    return badges;
  }, [references, audioAssignments, promptSourceAssetId, toolSourceAssetId, workspaceMode]);

  useEffect(() => {
    // masks are resolution-bound; drop them whenever the tool source changes
    setToolMask("");
  }, [toolSourceAssetId]);

  async function refreshApiKeyStatus() {
    const response = await fetch("/api/bfl/key", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not read API key status.");
    setApiKeyStatus(data);
    return data as ApiKeyStatus;
  }

  useEffect(() => {
    refreshApiKeyStatus().catch(() => undefined);
  }, []);

  async function saveApiKeyToSecureStore() {
    if (!apiKey.trim()) {
      setError("Paste a FLUX API key before saving it.");
      return;
    }
    setIsSavingApiKey(true);
    setError("");
    try {
      const response = await fetch("/api/bfl/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save API key.");
      setApiKey("");
      setApiKeyStatus(data);
      setRecoveryMessage("Saved FLUX API key to macOS Keychain. The browser field has been cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save API key.");
    } finally {
      setIsSavingApiKey(false);
    }
  }

  async function forgetSecureApiKey() {
    setIsSavingApiKey(true);
    setError("");
    try {
      const response = await fetch("/api/bfl/key", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove API key.");
      setApiKeyStatus(data);
      setRecoveryMessage(data.deleted ? "Removed the dashboard FLUX API key from macOS Keychain." : "No Keychain API key was stored for this dashboard.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove API key.");
    } finally {
      setIsSavingApiKey(false);
    }
  }

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
    const plannedMissingImageTokens = Array.from(
      new Set(
        items.flatMap((item) =>
          missingPromptImageTokens(String(item.body.prompt || ""), references)
        )
      )
    ).sort((left, right) => left - right);
    const plannedMissingRoleTokens = Array.from(
      new Set(
        items.flatMap((item) =>
          missingPromptReferenceRoleTokens(String(item.body.prompt || ""), references)
        )
      )
    );
    if (plannedMissingImageTokens.length) {
      setError(
        `Planned prompt references ${plannedMissingImageTokens.map((index) => `@img${index}`).join(", ")} but the matching image slot is empty. Add the image to References or remove the token.`
      );
      return;
    }
    if (plannedMissingRoleTokens.length) {
      setError(
        `Planned prompt references ${plannedMissingRoleTokens.map((role) => `@${role}`).join(", ")} but the matching role has no image. Add an image to that reference role or remove the token.`
      );
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
    setPromptSourceAssetId(asset.id);
    setSeed(asset.seed ? String(asset.seed) : "");
    setModel(modelOptions.some((option) => option.value === asset.model) ? asset.model : "pro-preview");
    setWorkspaceMode("prompt");
    setRecoveryMessage(`Loaded prompt from ${asset.title || asset.id}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function addAssetToPromptReferences(payload: string, role?: ReferenceRole) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return null;
    const slot = addAssetReference(asset, role);
    if (!slot) return null;
    const referenceRole = referenceRoleConfig(role, slot - 1);
    setWorkspaceMode("prompt");
    setRecoveryMessage(
      `Added ${asset.title || asset.id} as ${referenceRole.label} @img${slot}. The submitted prompt includes the reference roles cue.`
    );
    return slot;
  }
  async function addReferenceFiles(files: File[], role?: ReferenceRole) {
    const imported = await importImageAssetFiles(files, { assetKind: "reference", focusAssetsTab: false });
    if (!imported.length) return [];
    const slots = addAssetReferences(imported, role);
    if (!slots.length) return [];
    const roleLabel = role ? `${referenceRoleConfig(role).label} ` : "";
    setRecoveryMessage(`Added ${roleLabel}${slots.map((slot) => `@img${slot}`).join(", ")} to references.`);
    return slots;
  }
  async function setPrimaryReferenceFiles(files: File[], role?: ReferenceRole) {
    const [asset] = await importImageAssetFiles(files.slice(0, 1), {
      assetKind: "reference",
      focusAssetsTab: false
    });
    if (!asset) return null;
    setPrimaryAssetReference(asset, role);
    setRecoveryMessage(`Added ${asset.title || asset.id} as the primary reference.`);
    return 1;
  }
  async function addPromptReferenceFiles(files: File[], role?: ReferenceRole) {
    const slots = await addReferenceFiles(files, role);
    if (!slots.length) return [];
    const roleLabel = role ? `${referenceRoleConfig(role).label} ` : "";
    setWorkspaceMode("prompt");
    setRecoveryMessage(
      `Added ${roleLabel}${slots.map((slot) => `@img${slot}`).join(", ")} to prompt references.`
    );
    return slots;
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
      setError("Select a source image from the assets library.");
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

  async function saveGlyphAsset(payload: {
    pngDataUrl: string;
    svg: string;
    width: number;
    height: number;
    sourceAsset: AssetRecord;
  }) {
    const id = `glyph-${Date.now()}`;
    const asset: AssetRecord = {
      id,
      title: `glyph: ${payload.sourceAsset.title || payload.sourceAsset.id}`,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      imageDataUrl: payload.pngDataUrl,
      imageUrl: "",
      image_url: "",
      sampleUrl: "",
      model: "imagetracer",
      prompt: payload.sourceAsset.prompt || "",
      status: "complete",
      width: payload.width,
      height: payload.height,
      aspectRatio: `${payload.width}:${payload.height}`,
      provider: "local-glyph",
      payload: { svg: payload.svg },
      references: [],
      sourceAssetId: payload.sourceAsset.id,
      operation: "glyphs",
      assetKind: "asset"
    };
    await persistAssetImage(id, payload.pngDataUrl);
    setAssets((current) => [asset, ...current]);
    setSelectedAsset(asset);
    setRecoveryMessage(`Saved glyph from ${payload.sourceAsset.title || payload.sourceAsset.id} to the library.`);
  }

  return {
    apiKey,
    setApiKey,
    apiKeyStatus,
    isSavingApiKey,
    refreshApiKeyStatus,
    saveApiKeyToSecureStore,
    forgetSecureApiKey,
    prompts,
    activeId,
    activePromptLibraryId,
    selectedComboIds,
    promptText,
    setPromptText: editPromptText,
    promptSourceAsset,
    referenceCue,
    effectiveReferenceCue,
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
    glyphSettings,
    activeGlyphDraft,
    updateGlyphSettings,
    updateActiveGlyphDraft,
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
    addPromptReferenceFiles,
    setPrimaryReferenceFiles,
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    checkBalance,
    generate,
    selectAllPromptSources,
    clearPromptSources,
    runPermutationScript,
    recoverStoredAssets,
    importImageAssetFiles,
    importPngMetadataFiles,
    toggleFavorite,
    deleteAsset,
    sendAssetToPrompt,
    addAssetToPromptReferences,
    sendAssetToWorkspace,
    importToolSourceFiles,
    loadToolSourceFromDropPayload,
    clearToolSourceAsset,
    runWorkspaceTool,
    saveGlyphAsset,
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
