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
import { assetFromImageSource } from "@/lib/image-asset-import";
import {
  buildToolAssetRecord,
  buildToolFailureLogEntry,
  buildToolRequestBody,
  buildToolRunLogEntry,
  executeToolRun,
  toolRunBlocker,
  type ToolRunInput
} from "@/lib/dashboard-tools";
import { formatPrompt, stripReferenceCue } from "@/lib/prompt-utils";
import { estimateMegapixels, estimateMinimumCost, estimateTokens, modelOptions } from "@/lib/pricing";
import { getBflModel } from "@/lib/provider-registry";
import { parseReferenceDragPayload } from "@/lib/reference-drag";
import { referenceDropTargets, referenceRoleConfig, referenceRoleToken } from "@/lib/reference-roles";
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

type ApiKeyRouteResponse = Partial<ApiKeyStatus> & {
  deleted?: boolean;
  error?: string;
  saved?: boolean;
};

async function readApiKeyRouteResponse(response: Response) {
  const text = await response.text();
  if (!text) return {} as ApiKeyRouteResponse;
  try {
    return JSON.parse(text) as ApiKeyRouteResponse;
  } catch {
    return { error: text.slice(0, 240) || `HTTP ${response.status}` };
  }
}

function apiKeyRouteError(data: ApiKeyRouteResponse, fallback: string) {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useDashboardState() {
  // Generate prompt state stays separate from image-tool prompt state.
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [vtoPromptText, setVtoPromptText] = useState("");
  const [outpaintPromptText, setOutpaintPromptText] = useState("");
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
  const [vtoGarmentAssetIds, setVtoGarmentAssetIds] = useState<(string | null)[]>([null, null, null, null]);
  const [toolMask, setToolMask] = useState("");
  const [toolBrushSize, setToolBrushSize] = useState(48);
  const [toolDilatePixels, setToolDilatePixels] = useState(10);
  const [toolGuidance, setToolGuidance] = useState(30);
  const [toolSteps, setToolSteps] = useState(50);
  const [toolSafetyTolerance, setToolSafetyTolerance] = useState(2);
  const [toolOutputFormat, setToolOutputFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [outpaintOffsetX, setOutpaintOffsetX] = useState("");
  const [outpaintOffsetY, setOutpaintOffsetY] = useState("");
  const [outpaintMode, setOutpaintMode] = useState<"high" | "fast">("high");
  const [outpaintAutoCrop, setOutpaintAutoCrop] = useState(false);
  const [audioAssignments, setAudioAssignments] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const activeModelConfig = useMemo(() => getBflModel(model) || getBflModel("pro-preview")!, [model]);

  function editPromptText(value: string) {
    setPromptSourceAssetId(null);
    setPromptText(value);
  }

  function toolPromptForMode(mode: WorkspaceMode) {
    if (mode === "vto") return vtoPromptText;
    if (mode === "outpaint") return outpaintPromptText;
    return "";
  }

  function copyGeneratePromptToTool(mode: WorkspaceMode) {
    if (mode === "vto") {
      setVtoPromptText(promptText);
      setRecoveryMessage("Copied Generate prompt to VTO prompt.");
      return;
    }
    if (mode === "outpaint") {
      setOutpaintPromptText(promptText);
      setRecoveryMessage("Copied Generate prompt to Outpaint prompt.");
    }
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
      setVtoGarmentAssetIds((current) => current.map((assetId) => (assetId === id ? null : assetId)));
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
    sendAssetToReference: sendAssetToReferenceBase,
    addReferenceFromDragPayload
  } = useReferences({
    assets,
    maxReferences: activeModelConfig.maxReferences,
    modelLabel: activeModelConfig.label,
    setError
  });

  useEffect(() => {
    if (references.length <= activeModelConfig.maxReferences) return;
    setReferences(references.slice(0, activeModelConfig.maxReferences));
    setRecoveryMessage(
      `${activeModelConfig.label} accepts up to ${activeModelConfig.maxReferences} reference image${
        activeModelConfig.maxReferences === 1 ? "" : "s"
      }. Extra references were removed for this model.`
    );
  }, [activeModelConfig.label, activeModelConfig.maxReferences, references, setReferences]);

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
  const vtoGarmentSlots = useMemo(
    () => vtoGarmentAssetIds.map((id) => (id ? assets.find((asset) => asset.id === id) || null : null)),
    [assets, vtoGarmentAssetIds]
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
    vtoGarmentSlots.forEach((asset, index) => {
      if (!asset) return;
      (badges[asset.id] ||= []).push({
        label: `VTO ${index + 1}`,
        kind: "vto",
        title: `Virtual Try-On garment ${index + 1}`
      });
    });
    return badges;
  }, [references, audioAssignments, promptSourceAssetId, toolSourceAssetId, workspaceMode, vtoGarmentSlots]);

  useEffect(() => {
    // masks are resolution-bound; drop them whenever the tool source changes
    setToolMask("");
  }, [toolSourceAssetId]);

  async function refreshApiKeyStatus() {
    try {
      const response = await fetch("/api/bfl/key", { cache: "no-store" });
      const data = await readApiKeyRouteResponse(response);
      if (!response.ok) throw new Error(apiKeyRouteError(data, "Could not read API key status."));
      setError("");
      setApiKeyStatus(data as ApiKeyStatus);
      return data as ApiKeyStatus;
    } catch (err) {
      setError(errorMessage(err, "Could not reach the local API key route. Check that the dashboard server is running for this tab."));
      return null;
    }
  }

  useEffect(() => {
    void refreshApiKeyStatus();
  }, []);

  async function saveApiKeyToSecureStore() {
    if (!apiKey.trim()) {
      setError("Paste a FLUX API key before saving it.");
      return;
    }
    const service = apiKeyStatus?.keychain?.service || "BFL Dashboard FLUX API Key";
    const confirmed = window.confirm(
      `Save this FLUX API key to macOS Keychain as "${service}"?\n\nThe dashboard will read it for future FLUX requests, then clear the browser field.`
    );
    if (!confirmed) {
      setRecoveryMessage("Keeping the typed FLUX API key in this browser session only.");
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
      const data = await readApiKeyRouteResponse(response);
      if (!response.ok) throw new Error(apiKeyRouteError(data, "Could not save API key."));
      setApiKey("");
      setApiKeyStatus(data as ApiKeyStatus);
      setRecoveryMessage("Saved FLUX API key to macOS Keychain. The browser field has been cleared.");
    } catch (err) {
      setError(errorMessage(err, "Could not save API key."));
    } finally {
      setIsSavingApiKey(false);
    }
  }

  async function forgetSecureApiKey() {
    setIsSavingApiKey(true);
    setError("");
    try {
      const response = await fetch("/api/bfl/key", { method: "DELETE" });
      const data = await readApiKeyRouteResponse(response);
      if (!response.ok) throw new Error(apiKeyRouteError(data, "Could not remove API key."));
      setApiKeyStatus(data as ApiKeyStatus);
      setRecoveryMessage(data.deleted ? "Removed the dashboard FLUX API key from macOS Keychain." : "No Keychain API key was stored for this dashboard.");
    } catch (err) {
      setError(errorMessage(err, "Could not remove API key."));
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
          missingPromptImageTokens(stripReferenceCue(String(item.body.prompt || "")), references)
        )
      )
    ).sort((left, right) => left - right);
    const plannedMissingRoleTokens = Array.from(
      new Set(
        items.flatMap((item) =>
          missingPromptReferenceRoleTokens(stripReferenceCue(String(item.body.prompt || "")), references)
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
        `Planned prompt references ${plannedMissingRoleTokens.map((role) => referenceRoleToken(role)).join(", ")} but the matching role has no image. Add an image to that reference role or remove the token.`
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
  function addAssetToPromptReferences(payload: string, role?: ReferenceRole, targetId?: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return null;
    const slot = addAssetReference(asset, role, targetId);
    if (!slot) return null;
    const referenceRole = referenceDropTargets.find((target) => target.id === targetId) || referenceRoleConfig(role, slot - 1);
    setWorkspaceMode("prompt");
    setRecoveryMessage(
      `Added ${asset.title || asset.id} as ${referenceRole.label} @img${slot}. The submitted prompt includes the reference roles cue.`
    );
    return slot;
  }

  function sendAssetToReference(asset: AssetRecord, role?: ReferenceRole, targetId?: string) {
    const slot = sendAssetToReferenceBase(asset, role, targetId);
    if (!slot) return null;
    const referenceRole = referenceDropTargets.find((target) => target.id === targetId) || referenceRoleConfig(role, slot - 1);
    setWorkspaceMode("prompt");
    setRecoveryMessage(`Added ${asset.title || asset.id} as ${referenceRole.label} @img${slot}.`);
    return slot;
  }
  async function addReferenceFiles(files: File[], role?: ReferenceRole, targetId?: string) {
    const imported = await importImageAssetFiles(files, { assetKind: "reference", focusAssetsTab: false });
    if (!imported.length) return [];
    const slots = addAssetReferences(imported, role, targetId);
    if (!slots.length) return [];
    const roleLabel = targetId
      ? `${referenceDropTargets.find((target) => target.id === targetId)?.label || referenceRoleConfig(role).label} `
      : role
        ? `${referenceRoleConfig(role).label} `
        : "";
    setRecoveryMessage(`Added ${roleLabel}${slots.map((slot) => `@img${slot}`).join(", ")} to references.`);
    return slots;
  }
  async function setPrimaryReferenceFiles(files: File[], role?: ReferenceRole, targetId?: string) {
    const [asset] = await importImageAssetFiles(files.slice(0, 1), {
      assetKind: "reference",
      focusAssetsTab: false
    });
    if (!asset) return null;
    setPrimaryAssetReference(asset, role, targetId);
    setRecoveryMessage(`Added ${asset.title || asset.id} as the primary reference.`);
    return 1;
  }
  async function addPromptReferenceFiles(files: File[], role?: ReferenceRole, targetId?: string) {
    const slots = await addReferenceFiles(files, role, targetId);
    if (!slots.length) return [];
    const roleLabel = targetId
      ? `${referenceDropTargets.find((target) => target.id === targetId)?.label || referenceRoleConfig(role).label} `
      : role
        ? `${referenceRoleConfig(role).label} `
        : "";
    setWorkspaceMode("prompt");
    setRecoveryMessage(
      `Added ${roleLabel}${slots.map((slot) => `@img${slot}`).join(", ")} to prompt references.`
    );
    return slots;
  }
  function setVtoGarmentAsset(slotIndex: number, asset: AssetRecord) {
    if (slotIndex < 0 || slotIndex > 3) return;
    setVtoGarmentAssetIds((current) => {
      const next = [...current];
      next[slotIndex] = asset.id;
      return next;
    });
    setWorkspaceMode("vto");
    setRecoveryMessage(`Added ${asset.title || asset.id} as VTO garment ${slotIndex + 1}.`);
  }
  async function assetFromVtoReferencePayload(payload: string) {
    const reference = parseReferenceDragPayload(payload);
    if (!reference) return null;
    if (reference.assetId) return assets.find((asset) => asset.id === reference.assetId) || null;
    if (!reference.value) return null;

    const asset = await assetFromImageSource({
      id: reference.id ? `vto-reference-${reference.id}` : undefined,
      name: reference.name || "VTO garment reference",
      imageDataUrl: reference.value.startsWith("data:") ? reference.value : undefined,
      imageUrl: reference.value.startsWith("data:") ? undefined : reference.value,
      assetKind: "reference",
      provider: "reference",
      model: "reference-image",
      payload: {
        source: "vto-reference-drag",
        referenceId: reference.id,
        referenceIndex: reference.index
      }
    });
    if (asset.imageDataUrl?.startsWith("data:")) await persistAssetImage(asset.id, asset.imageDataUrl);
    setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    return asset;
  }
  async function loadVtoGarmentFromDropPayload(slotIndex: number, payload: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId) || (await assetFromVtoReferencePayload(payload));
    if (!asset) return null;
    setVtoGarmentAsset(slotIndex, asset);
    return asset;
  }
  async function importVtoGarmentFiles(slotIndex: number, files: File[]) {
    const [asset] = await importImageAssetFiles(files.slice(0, 1), { assetKind: "reference", focusAssetsTab: false });
    if (!asset) return null;
    setVtoGarmentAsset(slotIndex, asset);
    return asset;
  }
  function clearVtoGarment(slotIndex: number) {
    setVtoGarmentAssetIds((current) => {
      const next = [...current];
      next[slotIndex] = null;
      return next;
    });
  }
  async function runWorkspaceTool() {
    if (workspaceMode === "prompt") {
      void generate();
      return;
    }
    if (workspaceMode === "glyphs") {
      setError("Glyphs has no BFL endpoint yet. Use the local vectorizer from the glyph workspace.");
      return;
    }
    if (!toolSourceAsset) {
      setError("Select a source image from the assets library.");
      return;
    }
    const input: ToolRunInput = {
      mode: workspaceMode,
      sourceAsset: toolSourceAsset,
      vtoGarments: vtoGarmentSlots.filter((asset): asset is AssetRecord => Boolean(asset)),
      apiKey,
      mask: toolMask,
      prompt: toolPromptForMode(workspaceMode),
      seed,
      dilatePixels: toolDilatePixels,
      guidance: toolGuidance,
      steps: toolSteps,
      safetyTolerance: toolSafetyTolerance,
      outputFormat: toolOutputFormat,
      autoCrop: outpaintAutoCrop,
      canvasWidth: width,
      canvasHeight: height,
      offsetX: outpaintOffsetX,
      offsetY: outpaintOffsetY,
      outpaintMode
    };
    const blocker = toolRunBlocker({
      mode: input.mode,
      mask: input.mask,
      prompt: input.prompt,
      garmentCount: input.vtoGarments.length,
      hasSource: true
    });
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
    vtoPromptText,
    setVtoPromptText,
    outpaintPromptText,
    setOutpaintPromptText,
    copyGeneratePromptToTool,
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
    activeModelConfig,
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
    vtoGarmentSlots,
    loadVtoGarmentFromDropPayload,
    importVtoGarmentFiles,
    clearVtoGarment,
    toolMask,
    setToolMask,
    toolBrushSize,
    setToolBrushSize,
    toolDilatePixels,
    setToolDilatePixels,
    toolGuidance,
    setToolGuidance,
    toolSteps,
    setToolSteps,
    toolSafetyTolerance,
    setToolSafetyTolerance,
    toolOutputFormat,
    setToolOutputFormat,
    outpaintOffsetX,
    setOutpaintOffsetX,
    outpaintOffsetY,
    setOutpaintOffsetY,
    outpaintMode,
    setOutpaintMode,
    outpaintAutoCrop,
    setOutpaintAutoCrop,
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
