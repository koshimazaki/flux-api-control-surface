"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildRunPlanPayload,
  clampBatchCount,
  composePrompt,
  fetchRunPlan,
  missingPromptImageTokens,
  missingPromptReferenceRoleTokens,
  parseSeed,
  queueJobRunLogEntry,
  type BatchProgress,
  type PlanRequestItem
} from "@/lib/dashboard-generation";
import { persistAssetImage } from "@/lib/dashboard-assets";
import { assetFromImageSource } from "@/lib/image-asset-import";
import {
  buildToolAssetRecord,
  buildToolFailureLogEntry,
  buildToolRequestBody,
  buildToolRunLogEntry,
  buildVtoGarmentCompositeAsset,
  createVtoGarmentComposite,
  executeToolRun,
  toolRunBlocker,
  type ToolRunInput
} from "@/lib/dashboard-tools";
import { formatPrompt, stripReferenceCue } from "@/lib/prompt-utils";
import { estimateMegapixels, estimateMinimumCost, estimateTokens, modelOptions } from "@/lib/pricing";
import { advanceSeed, randomSeedString } from "@/lib/seed";
import type { GenerationQueueJob } from "@/lib/generation-queue";
import { flux3MediaFromAsset, type Flux3InputMedia } from "@/lib/flux3-video";
import { getBflModel } from "@/lib/provider-registry";
import { parseReferenceDragPayload } from "@/lib/reference-drag";
import { referenceDropTargets, referenceRoleConfig, referenceRoleToken } from "@/lib/reference-roles";
import { useAssetLibrary } from "@/lib/dashboard/use-asset-library";
import { useAssetCollections } from "@/lib/dashboard/use-asset-collections";
import { glyphPreviewBackgroundForSvg, type GlyphPreviewBackground } from "@/lib/glyph-svg";
import { useBalance } from "@/lib/dashboard/use-balance";
import { useGlyphLabCache } from "@/lib/dashboard/use-glyph-lab-cache";
import { usePromptLibrary } from "@/lib/dashboard/use-prompt-library";
import { useReferences } from "@/lib/dashboard/use-references";
import { useServerQueue } from "@/lib/dashboard/use-server-queue";
import { useToolSource, workspaceModeLabels } from "@/lib/dashboard/use-tool-source";
import { useTrainingCollections } from "@/lib/dashboard/use-training-collections";
import {
  defaultToolWorkspaceCache,
  loadToolWorkspaceCache,
  persistToolWorkspaceCache
} from "@/lib/dashboard/workspace-cache";
import type {
  AssetBadge,
  AssetRecord,
  BatchMode,
  DashboardTab,
  ImageWorkspaceMode,
  ReferenceImage,
  ReferenceRole,
  WorkspaceMode,
  ApiKeyStatus
} from "@/lib/types";

type ApiKeyRouteResponse = Partial<ApiKeyStatus> & {
  deleted?: boolean;
  error?: string;
  saved?: boolean;
};

const NORMALIZE_REFERENCES_STORAGE_KEY = "bfl-normalize-references";

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
  const [hasHydratedWorkspaceCache, setHasHydratedWorkspaceCache] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [vtoPromptText, setVtoPromptText] = useState(defaultToolWorkspaceCache.vtoPromptText);
  const [outpaintPromptText, setOutpaintPromptText] = useState(defaultToolWorkspaceCache.outpaintPromptText);
  const [promptSourceAssetId, setPromptSourceAssetId] = useState<string | null>(null);
  const [model, setModel] = useState("pro-preview");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeedValue] = useState("");
  const [seedLocked, setSeedLocked] = useState(false);
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [normalizeReferences, setNormalizeReferences] = useState(true);
  const [batchCount, setBatchCount] = useState(1);
  const [batchMode, setBatchMode] = useState<BatchMode>("current");
  const [batchProgress] = useState<BatchProgress | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("assets");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(defaultToolWorkspaceCache.workspaceMode);
  const [toolSourceAssetId, setToolSourceAssetId] = useState<string | null>(defaultToolWorkspaceCache.sharedSourceAssetId);
  const [vtoSourceAssetId, setVtoSourceAssetId] = useState<string | null>(defaultToolWorkspaceCache.vtoSourceAssetId);
  const [glyphSourceAssetId, setGlyphSourceAssetId] = useState<string | null>(defaultToolWorkspaceCache.glyphSourceAssetId);
  const [vtoGarmentAssetIds, setVtoGarmentAssetIds] = useState<(string | null)[]>(
    defaultToolWorkspaceCache.vtoGarmentAssetIds
  );
  const [flux3Keyframes, setFlux3Keyframes] = useState<Flux3InputMedia[]>([]);
  const [toolMask, setToolMask] = useState("");
  const [toolBrushSize, setToolBrushSize] = useState(48);
  const [toolDilatePixels, setToolDilatePixels] = useState(10);
  const [toolGuidance, setToolGuidance] = useState(30);
  const [toolSteps, setToolSteps] = useState(50);
  const [toolSafetyTolerance, setToolSafetyTolerance] = useState(2);
  const [toolOutputFormat, setToolOutputFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [outpaintOffsetX, setOutpaintOffsetX] = useState(defaultToolWorkspaceCache.outpaintOffsetX);
  const [outpaintOffsetY, setOutpaintOffsetY] = useState(defaultToolWorkspaceCache.outpaintOffsetY);
  const [outpaintMode, setOutpaintMode] = useState<"high" | "fast">(defaultToolWorkspaceCache.outpaintMode);
  const [outpaintAutoCrop, setOutpaintAutoCrop] = useState(defaultToolWorkspaceCache.outpaintAutoCrop);
  const [audioAssignments, setAudioAssignments] = useState<Record<string, string>>({});
  const [isToolGenerating, setIsToolGenerating] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const activeModelConfig = useMemo(() => getBflModel(model) || getBflModel("pro-preview")!, [model]);

  useEffect(() => {
    setSeedValue((current) => current.trim() || randomSeedString());
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NORMALIZE_REFERENCES_STORAGE_KEY);
      if (saved !== null) setNormalizeReferences(saved !== "false");
    } catch {
      // Non-critical preference.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NORMALIZE_REFERENCES_STORAGE_KEY, String(normalizeReferences));
    } catch {
      // Non-critical preference.
    }
  }, [normalizeReferences]);

  function setSeed(value: string) {
    setSeedValue(value);
  }

  function randomizeSeed() {
    setSeedValue(randomSeedString());
  }

  function applyStoredSeed(value: string) {
    const storedSeed = value.trim();
    if (seedLocked) {
      if (storedSeed) setSeedValue(storedSeed);
      return;
    }
    setSeedValue((current) => current.trim() || randomSeedString());
  }

  function ensureSubmissionSeed() {
    const parsed = parseSeed(seed);
    if (parsed !== null) return { text: seed.trim(), value: parsed };
    const nextSeed = randomSeedString();
    setSeedValue(nextSeed);
    return { text: nextSeed, value: Number(nextSeed) };
  }

  function withSubmissionSeed<T extends Record<string, unknown>>(payload: T) {
    const submissionSeed = ensureSubmissionSeed();
    return { ...payload, seed: submissionSeed.value };
  }

  function advanceSeedIfUnlocked() {
    setSeedValue((current) => advanceSeed(seedLocked, current));
  }

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

  function sourceAssetIdForMode(mode: WorkspaceMode) {
    if (mode === "vto") return vtoSourceAssetId;
    if (mode === "glyphs") return glyphSourceAssetId;
    if (mode === "erase" || mode === "outpaint" || mode === "deblur") return toolSourceAssetId;
    return null;
  }

  function setSourceAssetIdForMode(mode: ImageWorkspaceMode, id: string | null) {
    if (mode === "vto") {
      setVtoSourceAssetId(id);
      return;
    }
    if (mode === "glyphs") {
      setGlyphSourceAssetId(id);
      return;
    }
    setToolSourceAssetId(id);
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
      if (vtoSourceAssetId === id) setVtoSourceAssetId(null);
      if (glyphSourceAssetId === id) setGlyphSourceAssetId(null);
      if (promptSourceAssetId === id) setPromptSourceAssetId(null);
      setVtoGarmentAssetIds((current) => current.map((assetId) => (assetId === id ? null : assetId)));
    }
  });

  const {
    assetCollections,
    collectionFilter,
    setCollectionFilter,
    openedCollection,
    openedCollectionId,
    setOpenedCollectionId,
    createAssetCollection,
    addAssetsToCollection,
    addSelectedAssetsToAssetCollection,
    addFilesToCollection,
    removeAssetFromCollection,
    deleteAssetCollection,
    exportAssetCollection,
    refreshAssetCollections
  } = useAssetCollections({
    assets,
    selectedAssetIds,
    setSelectedAssetIds,
    setError,
    setRecoveryMessage,
    importImageAssetFiles
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
    comboSettings,
    lastDeletedPrompt,
    activePrompt,
    promptLibraryOptions,
    visiblePrompts,
    permutationPairCount,
    selectPrompt,
    selectPromptLibrary,
    toggleComboPrompt,
    saveComboSettings,
    updateComboMode,
    updateComboEnvironment,
    createComboPrompt,
    resetComboPrompt,
    deletePrompt,
    undoDeletePrompt,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    saveVideoPromptToLibrary,
    mergeExternalPromptRecord,
    selectAllPromptSources,
    clearPromptSources,
    savePrompt: savePromptWithText,
    importPromptJson: importPromptJsonWithText
  } = usePromptLibrary({ setPromptText: editPromptText, setSeed: applyStoredSeed, setBatchMode, setError, setRecoveryMessage });

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
  const serverQueue = useServerQueue({ onError: setError });
  const generationQueue = serverQueue.queue as GenerationQueueJob[];
  const generationQueueSummary = serverQueue.summary;
  const generationQueueControls = useMemo(
    () => ({
      paused: serverQueue.paused,
      pauseReason: serverQueue.pauseReason,
      onPause: () => void serverQueue.pause(),
      onResume: () => void serverQueue.resume(),
      onRetry: (id: string) => void serverQueue.retry(id),
      onCancel: (id: string) => void serverQueue.cancel(id),
      onPrioritize: (id: string, priority: number) => void serverQueue.prioritize(id, priority),
      onClearSettled: () => void serverQueue.clearSettled()
    }),
    [serverQueue]
  );
  // inFlight, not active: a paused or dependency-blocked queue still counts as
  // "active", which would pin the run button at "generating" indefinitely.
  const isGenerating = isToolGenerating || generationQueueSummary.inFlight > 0;
  const loggedQueueJobsRef = useRef<Set<string>>(new Set());
  const queueLogFloorRef = useRef(Date.now());

  // The run log follows the server queue: jobs that settle while this tab is
  // open are logged once, and jobs that settled before it opened are skipped so
  // a refresh does not replay history.
  useEffect(() => {
    const fresh = generationQueue.filter(
      (job) =>
        (job.status === "complete" || job.status === "failed") &&
        !loggedQueueJobsRef.current.has(job.id) &&
        (job.finishedAt || 0) >= queueLogFloorRef.current
    );
    generationQueue.forEach((job) => {
      if (job.status === "complete" || job.status === "failed") loggedQueueJobsRef.current.add(job.id);
    });
    if (!fresh.length) return;
    setRunLog((current) => [...fresh.map(queueJobRunLogEntry).reverse(), ...current]);
    const latestCredits = fresh
      .map((job) => (job as { creditsAfter?: number }).creditsAfter)
      .filter((value): value is number => typeof value === "number")
      .pop();
    if (typeof latestCredits === "number") setBalance({ credits: latestCredits, checkedAt: Date.now() });
    const failed = fresh.filter((job) => job.status === "failed");
    if (failed.length) setError(`${failed[0].title}: ${failed[0].error || "Generation failed"}`);
  }, [generationQueue, setBalance, setRunLog]);

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
        normalizeReferences,
        referenceCue: effectiveReferenceCue,
        referenceWeight,
        references,
        comboMode: comboSettings.mode,
        comboSettings
      }),
    [activeId, batchCount, batchMode, comboSettings, effectiveReferenceCue, height, model, normalizeReferences, promptText, promptUpsampling, referenceWeight, references, seed, selectedComboIds, width]
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
  const activeToolSourceAssetId = sourceAssetIdForMode(workspaceMode);
  const toolSourceAsset = useMemo(
    () => assets.find((asset) => asset.id === activeToolSourceAssetId) || null,
    [assets, activeToolSourceAssetId]
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
  } = useGlyphLabCache(glyphSourceAssetId || undefined);
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
    setSourceAssetIdForMode,
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
    assetCollections.forEach((collection) => {
      collection.members.forEach((member) => {
        (badges[member.assetId] ||= []).push({
          label: collection.name,
          kind: "collection",
          title: `In collection: ${collection.name}`
        });
      });
    });
    if (toolSourceAssetId && (workspaceMode === "erase" || workspaceMode === "outpaint" || workspaceMode === "deblur")) {
      (badges[toolSourceAssetId] ||= []).push({
        label: workspaceModeLabels[workspaceMode],
        kind: workspaceMode,
        title: `Active ${workspaceModeLabels[workspaceMode]} source`
      });
    }
    if (vtoSourceAssetId) {
      (badges[vtoSourceAssetId] ||= []).push({
        label: workspaceModeLabels.vto,
        kind: "vto",
        title: "Active VTO person/source"
      });
    }
    if (glyphSourceAssetId) {
      (badges[glyphSourceAssetId] ||= []).push({
        label: workspaceModeLabels.glyphs,
        kind: "glyphs",
        title: "Active Glyphs source"
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
    flux3Keyframes.forEach((media, index) => {
      if (!media.assetId) return;
      (badges[media.assetId] ||= []).push({
        label: `V${index + 1}`,
        kind: "flux3",
        title: `FLUX 3 video keyframe ${index + 1}`
      });
    });
    return badges;
  }, [
    references,
    audioAssignments,
    promptSourceAssetId,
    toolSourceAssetId,
    workspaceMode,
    vtoSourceAssetId,
    glyphSourceAssetId,
    vtoGarmentSlots,
    flux3Keyframes,
    assetCollections
  ]);

  useEffect(() => {
    const cache = loadToolWorkspaceCache();
    setWorkspaceMode(cache.workspaceMode);
    setToolSourceAssetId(cache.sharedSourceAssetId);
    setVtoSourceAssetId(cache.vtoSourceAssetId);
    setGlyphSourceAssetId(cache.glyphSourceAssetId);
    setVtoGarmentAssetIds(cache.vtoGarmentAssetIds);
    setVtoPromptText(cache.vtoPromptText);
    setOutpaintPromptText(cache.outpaintPromptText);
    setOutpaintOffsetX(cache.outpaintOffsetX);
    setOutpaintOffsetY(cache.outpaintOffsetY);
    setOutpaintMode(cache.outpaintMode);
    setOutpaintAutoCrop(cache.outpaintAutoCrop);
    setHasHydratedWorkspaceCache(true);
  }, []);

  useEffect(() => {
    // masks are resolution-bound; drop them whenever the tool source changes
    setToolMask("");
  }, [activeToolSourceAssetId]);

  useEffect(() => {
    if (!hasHydratedWorkspaceCache) return;
    const timer = window.setTimeout(
      () =>
        persistToolWorkspaceCache({
          workspaceMode,
          sharedSourceAssetId: toolSourceAssetId,
          vtoSourceAssetId,
          glyphSourceAssetId,
          vtoGarmentAssetIds,
          vtoPromptText,
          outpaintPromptText,
          outpaintOffsetX,
          outpaintOffsetY,
          outpaintMode,
          outpaintAutoCrop
        }),
      150
    );
    return () => window.clearTimeout(timer);
  }, [
    workspaceMode,
    hasHydratedWorkspaceCache,
    toolSourceAssetId,
    vtoSourceAssetId,
    glyphSourceAssetId,
    vtoGarmentAssetIds,
    vtoPromptText,
    outpaintPromptText,
    outpaintOffsetX,
    outpaintOffsetY,
    outpaintMode,
    outpaintAutoCrop
  ]);

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

  // Execution belongs to the server runner. The browser only enqueues typed jobs
  // and observes the persisted queue, so refreshing this tab (or closing it)
  // cannot stall or orphan paid work.
  async function enqueueGenerationItems(items: PlanRequestItem[]) {
    const activeReferences = references.filter((reference) => Boolean(reference.value));
    const batchId = `ui-${Date.now().toString(36)}`;
    try {
      await serverQueue.enqueue(
        items.map((item) => ({
          kind: "image" as const,
          operation: "generate",
          title: item.title,
          payload: {
            ...item.body,
            apiKey: apiKey.trim() || undefined,
            references: activeReferences.map((reference) => reference.value),
            // Lightweight descriptors so the saved output can rebuild reference
            // thumbnails after a reload (the image values themselves are not persisted).
            referenceMeta: activeReferences.map((reference) => ({
              assetId: reference.assetId,
              role: reference.role,
              name: reference.name,
              targetId: reference.targetId
            }))
          },
          batchId,
          batchIndex: item.batchIndex,
          batchTotal: item.batchTotal,
          estimatedCredits: item.estimatedCredits,
          estimatedUsd: item.estimatedUsd,
          promptTokens: item.promptTokens,
          sourceAssetIds: activeReferences
            .map((reference) => reference.assetId)
            .filter((value): value is string => Boolean(value))
        }))
      );
      setRecoveryMessage(
        `Queued ${items.length} generation${items.length === 1 ? "" : "s"} on the server; up to ${serverQueue.settings.globalLimit} run in parallel and finished images appear in Assets.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enqueue the generation batch.");
    }
  }

  async function generate(payload = runPlanPayload, mode = batchMode) {
    if (mode === "permutations" && selectedComboIds.length < 2) {
      setError("Select at least two prompts before running selected permutations.");
      return;
    }
    const payloadWithSeed = withSubmissionSeed(payload);
    let items;
    try {
      items = await fetchRunPlan(payloadWithSeed);
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
    enqueueGenerationItems(items);
    advanceSeedIfUnlocked();
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
      normalizeReferences,
      referenceCue: effectiveReferenceCue,
      referenceWeight,
      references,
      comboMode: comboSettings.mode,
      comboSettings
    });
    setBatchMode("permutations");
    setBatchCount(scriptCount);
    await generate(scriptPayload, "permutations");
  }
  function sendAssetToPrompt(asset: AssetRecord) {
    setPromptText(formatPrompt(asset.prompt));
    setPromptSourceAssetId(asset.id);
    applyStoredSeed(asset.seed ? String(asset.seed) : "");
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
  function sendAssetToNextVtoGarment(asset: AssetRecord) {
    const slotIndex = vtoGarmentAssetIds.findIndex((assetId) => !assetId);
    setWorkspaceMode("vto");
    setSelectedAsset(null);
    setError("");
    if (slotIndex === -1) {
      setRecoveryMessage("All four VTO garment slots are full. Clear a garment slot before adding another item.");
      return null;
    }
    setVtoGarmentAsset(slotIndex, asset);
    return slotIndex + 1;
  }
  function sendAssetToNextFlux3Keyframe(asset: AssetRecord) {
    if (asset.mediaType === "video") {
      setRecoveryMessage("FLUX 3 keyframes take images. Drag videos into the continuation slot instead.");
      return null;
    }
    const media = flux3MediaFromAsset(asset);
    if (!media) {
      setRecoveryMessage("That asset has no loadable image source for FLUX 3 keyframes.");
      return null;
    }
    if (flux3Keyframes.length >= 10) {
      setRecoveryMessage("All ten FLUX 3 keyframes are full. Remove one before adding another.");
      return null;
    }
    setError("");
    setFlux3Keyframes((current) => (current.length >= 10 ? current : [...current, media]));
    return flux3Keyframes.length + 1;
  }
  async function revealAssetLocally(asset: AssetRecord) {
    try {
      const response = await fetch("/api/outputs/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }));
        setRecoveryMessage(
          typeof data?.error === "string" && data.error ? data.error : "No local file exists for this asset."
        );
      }
    } catch {
      setError("Could not reach the local server to reveal the file.");
    }
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
    if (workspaceMode === "flux3") {
      setError("Use the FLUX 3 video controls in the video workspace.");
      return;
    }
    if (workspaceMode === "upscale") {
      setError("Use the Video Upscale controls in the upscale workspace.");
      return;
    }
    if (!toolSourceAsset) {
      setError("Select a source image from the assets library.");
      return;
    }
    let input: ToolRunInput = {
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
    input = { ...input, seed: ensureSubmissionSeed().text };
    setError("");
    setIsToolGenerating(true);
    let preflightCompositeAsset: AssetRecord | null = null;
    const started = Date.now();
    try {
      const requestBody = buildToolRequestBody(input);
      const submittedGarmentCount = Array.isArray(requestBody.garments) ? requestBody.garments.length : 0;
      if (input.mode === "vto" && submittedGarmentCount > 1) {
        try {
          const compositeData = await createVtoGarmentComposite(input);
          preflightCompositeAsset = buildVtoGarmentCompositeAsset(compositeData, input);
          if (preflightCompositeAsset) {
            await persistAssetImage(preflightCompositeAsset.id, preflightCompositeAsset.imageDataUrl);
            setAssets((current) => [preflightCompositeAsset!, ...current]);
            setActiveTab("assets");
            setRecoveryMessage("Saved the VTO garment collage to the gallery; running Virtual Try-On.");
          }
        } catch (error) {
          console.warn("Could not save VTO garment collage preflight", error);
        }
      }
      if (preflightCompositeAsset) (requestBody as Record<string, unknown>).saveGarmentComposite = false;
      const data = await executeToolRun(requestBody);
      const asset = buildToolAssetRecord(data, input);
      const garmentCompositeAsset = preflightCompositeAsset ? null : buildVtoGarmentCompositeAsset(data, input);
      if (garmentCompositeAsset) await persistAssetImage(garmentCompositeAsset.id, garmentCompositeAsset.imageDataUrl);
      await persistAssetImage(asset.id, data.imageDataUrl);
      setAssets((current) => {
        if (!preflightCompositeAsset) return [asset, ...(garmentCompositeAsset ? [garmentCompositeAsset] : []), ...current];
        const compositeIndex = current.findIndex((item) => item.id === preflightCompositeAsset?.id);
        if (compositeIndex === -1) return [asset, preflightCompositeAsset, ...current];
        const next = [...current];
        next.splice(compositeIndex, 0, asset);
        return next;
      });
      setBalance({ credits: data.submit?.creditsAfter ?? balance.credits, checkedAt: Date.now() });
      setRunLog((current) => [buildToolRunLogEntry(asset, started), ...current]);
      setSelectedAsset(asset);
      setRecoveryMessage(
        `${workspaceModeLabels[workspaceMode]} complete for ${toolSourceAsset.title || toolSourceAsset.id}${
          garmentCompositeAsset
            ? "; saved the garment collage to the gallery."
            : preflightCompositeAsset
              ? "; garment collage is already in the gallery."
              : "."
        }`
      );
      advanceSeedIfUnlocked();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool run failed";
      setRunLog((current) => [buildToolFailureLogEntry(input, started, message), ...current]);
      setError(message);
    } finally {
      setIsToolGenerating(false);
    }
  }

  async function saveGlyphAsset(payload: {
    pngDataUrl: string;
    svg: string;
    width: number;
    height: number;
    sourceAsset: AssetRecord;
    previewBackground?: GlyphPreviewBackground;
  }) {
    const id = `glyph-${Date.now()}`;
    const previewBackground = payload.previewBackground || glyphPreviewBackgroundForSvg(payload.svg);
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
      payload: { svg: payload.svg, previewBackground },
      references: [],
      sourceAssetId: payload.sourceAsset.id,
      operation: "glyphs",
      assetKind: "asset",
      runSettings: {
        provider: "local-glyph",
        model: "imagetracer",
        operation: "glyphs",
        sourceAssetId: payload.sourceAsset.id,
        previewBackground,
        outputFormat: "png+svg"
      }
    };
    await persistAssetImage(id, payload.pngDataUrl);
    setAssets((current) => [asset, ...current]);
    setActiveTab("assets");
    setSearchQuery("");
    setSelectedAsset(null);
    setRecoveryMessage(`Saved glyph from ${payload.sourceAsset.title || payload.sourceAsset.id} to the library.`);
  }

  function clearDashboardAssets() {
    clearAssets();
    setToolSourceAssetId(null);
    setVtoSourceAssetId(null);
    setGlyphSourceAssetId(null);
    setPromptSourceAssetId(null);
    setVtoGarmentAssetIds([null, null, null, null]);
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
    comboSettings,
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
    seedLocked,
    setSeedLocked,
    randomizeSeed,
    promptUpsampling,
    setPromptUpsampling,
    normalizeReferences,
    setNormalizeReferences,
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
    toolSourceAssetId: activeToolSourceAssetId,
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
    flux3Keyframes,
    setFlux3Keyframes,
    sendAssetToNextFlux3Keyframe,
    revealAssetLocally,
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
    assetCollections,
    refreshAssetCollections,
    collectionFilter,
    openedCollection,
    openedCollectionId,
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
    isToolGenerating,
    generationQueue,
    generationQueueSummary,
    generationQueueConcurrency: serverQueue.settings.globalLimit,
    generationQueueControls,
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
    saveComboSettings,
    updateComboMode,
    updateComboEnvironment,
    createComboPrompt,
    resetComboPrompt,
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
    sendAssetToNextVtoGarment,
    importToolSourceFiles,
    loadToolSourceFromDropPayload,
    clearToolSourceAsset,
    runWorkspaceTool,
    saveGlyphAsset,
    saveSequencePrompt,
    saveAssetPromptToLibrary,
    saveVideoPromptToLibrary,
    mergeExternalPromptRecord,
    sendAssetToReference,
    addReferenceFromDragPayload,
    downloadAssetImage,
    clearAssets: clearDashboardAssets,
    toggleAssetSelection,
    setCollectionFilter,
    setOpenedCollectionId,
    createAssetCollection,
    addAssetsToCollection,
    addSelectedAssetsToAssetCollection,
    addFilesToCollection,
    removeAssetFromCollection,
    deleteAssetCollection,
    exportAssetCollection,
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
