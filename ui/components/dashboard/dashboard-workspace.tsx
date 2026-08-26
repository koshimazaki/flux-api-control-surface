import { useEffect, useState } from "react";
import { Flux3VideoWorkspace } from "@/components/flux3-video-workspace";
import { GenerateReferenceControls } from "@/components/generate-reference-controls";
import { ImageToolWorkspace } from "@/components/image-tool-workspace";
import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
import { ToolRunPanel } from "@/components/tool-run-panel";
import { WorkspaceModeTabs } from "@/components/workspace-mode-tabs";
import { VideoUpscaleWorkspace } from "@/components/video-upscale-workspace";
import { clampBatchCount, clampReferenceWeight } from "@/lib/dashboard-generation";
import { downloadText, formatPrompt } from "@/lib/prompt-utils";
import type { DashboardState } from "@/lib/use-dashboard-state";
import type { ImageWorkspaceMode } from "@/lib/types";

export function DashboardWorkspace({ state }: { state: DashboardState }) {
  const isFlux3Mode = state.workspaceMode === "flux3";
  const isUpscaleMode = state.workspaceMode === "upscale";
  const isVideoMode = isFlux3Mode || isUpscaleMode;
  const imageToolMode: ImageWorkspaceMode | null =
    state.workspaceMode === "prompt" || state.workspaceMode === "flux3" || state.workspaceMode === "upscale"
      ? null
      : state.workspaceMode;
  const [libraryCollapsed, setLibraryCollapsed] = useState(Boolean(imageToolMode) || isVideoMode);
  const toolPromptText =
    imageToolMode === "vto" ? state.vtoPromptText : imageToolMode === "outpaint" ? state.outpaintPromptText : "";
  const setToolPromptText =
    imageToolMode === "vto"
      ? state.setVtoPromptText
      : imageToolMode === "outpaint"
      ? state.setOutpaintPromptText
      : () => undefined;

  const promptLibrary = (
    <PromptLibrary
      prompts={state.visiblePrompts}
      libraryOptions={state.promptLibraryOptions}
      activeLibraryId={state.activePromptLibraryId}
      activeId={state.activeId}
      selectedIds={state.selectedComboIds}
      comboSettings={state.comboSettings}
      mediaKind={state.workspaceMediaKind}
      collapsed={libraryCollapsed}
      canCollapse
      onLibraryChange={state.selectPromptLibrary}
      onMediaKindChange={state.selectWorkspaceMediaKind}
      onSelect={state.selectPrompt}
      onToggleSelected={state.toggleComboPrompt}
      onComboModeChange={state.updateComboMode}
      onComboSettingsSave={state.saveComboSettings}
      onClearCombo={state.resetComboPrompt}
      onCollapsedChange={setLibraryCollapsed}
      onBuildCombo={state.createComboPrompt}
      onExport={() => downloadText("bfl-flower-prompts.json", JSON.stringify(state.prompts, null, 2))}
      onUseTemplatePrompt={(compiled) => {
        state.setPromptText(compiled.text);
        state.setRecoveryMessage(`Loaded the ${compiled.templateName} template into the prompt editor.`);
      }}
      onSaveTemplatePrompt={(compiled) => void state.saveVideoPromptToLibrary(compiled)}
    />
  );

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 900px)");
    const syncCollapsedState = () => {
      if (compactQuery.matches) setLibraryCollapsed(true);
    };
    syncCollapsedState();
    compactQuery.addEventListener("change", syncCollapsedState);
    return () => compactQuery.removeEventListener("change", syncCollapsedState);
  }, []);

  if (isFlux3Mode) {
    return (
      <section className={["workspace", "flux3Mode", libraryCollapsed ? "libraryCollapsed" : ""].filter(Boolean).join(" ")}>
        <WorkspaceModeTabs value={state.workspaceMode} onChange={state.setWorkspaceMode} />
        {promptLibrary}
        <Flux3VideoWorkspace
          apiKey={state.apiKey}
          assets={state.assets}
          mode={state.flux3SourceMode}
          onModeChange={state.setFlux3SourceMode}
          keyframes={state.flux3Keyframes}
          onKeyframesChange={state.setFlux3Keyframes}
          startVideo={state.flux3StartVideo}
          onStartVideoChange={state.setFlux3StartVideo}
          promptSeed={state.flux3PromptSeed}
          onSendToUpscale={state.sendVideoToUpscale}
          onGenerated={() => void state.checkBalance()}
          onOpenAssets={() => state.setActiveTab("assets")}
          generationQueue={state.generationQueue}
          generationQueueSummary={state.generationQueueSummary}
          generationQueueConcurrency={state.generationQueueConcurrency}
          generationQueueControls={state.generationQueueControls}
          libraryPrompt={state.visiblePrompts.find((prompt) => prompt.id === state.activeId)?.prompt}
        />
      </section>
    );
  }

  if (isUpscaleMode) {
    return (
      <section className={["workspace", "videoUpscaleMode", libraryCollapsed ? "libraryCollapsed" : ""].filter(Boolean).join(" ")}>
        <WorkspaceModeTabs value={state.workspaceMode} onChange={state.setWorkspaceMode} />
        {promptLibrary}
        <VideoUpscaleWorkspace
          apiKey={state.apiKey}
          assets={state.assets}
          pendingSource={state.upscaleSourceSeed}
          onGenerated={() => void state.checkBalance()}
          onOpenAssets={() => state.setActiveTab("assets")}
          generationQueue={state.generationQueue}
          generationQueueSummary={state.generationQueueSummary}
          generationQueueConcurrency={state.generationQueueConcurrency}
          generationQueueControls={state.generationQueueControls}
        />
      </section>
    );
  }

  return (
    <section className={["workspace", libraryCollapsed ? "libraryCollapsed" : ""].filter(Boolean).join(" ")}>
      <WorkspaceModeTabs value={state.workspaceMode} onChange={state.setWorkspaceMode} />
      {promptLibrary}
      <div className="workspaceMain">
        {imageToolMode ? (
          <ImageToolWorkspace
            mode={imageToolMode}
            sourceAsset={state.toolSourceAsset}
            brushSize={state.toolBrushSize}
            mask={state.toolMask}
            canvasWidth={state.width}
            canvasHeight={state.height}
            offsetX={state.outpaintOffsetX}
            offsetY={state.outpaintOffsetY}
            glyphSettings={state.glyphSettings}
            glyphDraft={state.activeGlyphDraft}
            vtoGarmentAssets={state.vtoGarmentSlots}
            onMaskChange={state.setToolMask}
            onOffsetXChange={state.setOutpaintOffsetX}
            onOffsetYChange={state.setOutpaintOffsetY}
            onGlyphSettingsChange={state.updateGlyphSettings}
            onGlyphDraftChange={state.updateActiveGlyphDraft}
            onSaveGlyph={state.saveGlyphAsset}
            onClearSource={state.clearToolSourceAsset}
            onSourceDropPayload={(payload) => void state.loadToolSourceFromDropPayload(payload)}
            onSourceFiles={(files) => void state.importToolSourceFiles(files)}
            onVtoGarmentDropPayload={(slotIndex, payload) => void state.loadVtoGarmentFromDropPayload(slotIndex, payload)}
            onVtoGarmentFiles={(slotIndex, files) => void state.importVtoGarmentFiles(slotIndex, files)}
            onClearVtoGarment={state.clearVtoGarment}
          />
        ) : (
          <PromptEditor
            activePrompt={state.activePrompt}
            promptText={state.promptText}
            onPromptChange={state.setPromptText}
            references={state.references}
            submittedReferenceCue={state.effectiveReferenceCue}
            submittedPrompt={state.promptForRun}
            promptSourceAsset={state.promptSourceAsset}
            environmentOptions={state.comboSettings.environmentOptions}
            activeEnvironment={state.comboSettings.environment}
            onEnvironmentSelect={state.updateComboEnvironment}
            onReferenceDropPayload={state.addAssetToPromptReferences}
            onReferenceFiles={state.addPromptReferenceFiles}
            referenceControls={
              <GenerateReferenceControls
                references={state.references}
                maxReferences={state.activeModelConfig.maxReferences}
                primaryReferenceUrl={state.primaryReferenceUrl}
                primaryReferencePreview={state.primaryReferencePreview}
                referenceWeight={state.referenceWeight}
                referenceCue={state.referenceCue}
                normalizeReferences={state.normalizeReferences}
                onReferencesChange={state.setReferences}
                onPrimaryReferenceUrlChange={state.setPrimaryReferenceUrl}
                onPrimaryReferenceFiles={state.setPrimaryReferenceFiles}
                onClearPrimaryReference={state.clearPrimaryReference}
                onReferenceWeightChange={(value) => state.setReferenceWeight(clampReferenceWeight(value))}
                onReferenceCueChange={state.setReferenceCue}
                onNormalizeReferencesChange={state.setNormalizeReferences}
                onReferenceFiles={state.addReferenceFiles}
                onReferenceDropPayload={state.addReferenceFromDragPayload}
              />
            }
            onImport={state.importPromptJson}
            onSave={() => void state.savePrompt()}
            onSaveAsNew={() => void state.savePrompt(true)}
            onDelete={() => void state.deletePrompt()}
            onReset={() => state.setPromptText(formatPrompt(state.activePrompt?.prompt || state.promptText))}
          />
        )}
      </div>
      {imageToolMode ? (
        <ToolRunPanel
          mode={imageToolMode}
          sourceAsset={state.toolSourceAsset}
          width={state.width}
          height={state.height}
          seed={state.seed}
          seedLocked={state.seedLocked}
          promptText={toolPromptText}
          vtoGarmentCount={state.vtoGarmentSlots.filter(Boolean).length}
          mask={state.toolMask}
          brushSize={state.toolBrushSize}
          dilatePixels={state.toolDilatePixels}
          guidance={state.toolGuidance}
          steps={state.toolSteps}
          safetyTolerance={state.toolSafetyTolerance}
          outputFormat={state.toolOutputFormat}
          offsetX={state.outpaintOffsetX}
          offsetY={state.outpaintOffsetY}
          outpaintMode={state.outpaintMode}
          autoCrop={state.outpaintAutoCrop}
          isGenerating={state.isGenerating}
          generationQueue={state.generationQueue}
          generationQueueSummary={state.generationQueueSummary}
          generationQueueConcurrency={state.generationQueueConcurrency}
          generationQueueControls={state.generationQueueControls}
          error={state.error || state.balance.error || ""}
          onWidthChange={state.setWidth}
          onHeightChange={state.setHeight}
          onSeedChange={state.setSeed}
          onSeedLockedChange={state.setSeedLocked}
          onRandomSeed={state.randomizeSeed}
          onPromptChange={setToolPromptText}
          onUseGeneratePrompt={() => {
            if (imageToolMode) state.copyGeneratePromptToTool(imageToolMode);
          }}
          onBrushSizeChange={state.setToolBrushSize}
          onDilatePixelsChange={state.setToolDilatePixels}
          onGuidanceChange={state.setToolGuidance}
          onStepsChange={state.setToolSteps}
          onSafetyToleranceChange={state.setToolSafetyTolerance}
          onOutputFormatChange={state.setToolOutputFormat}
          onOffsetXChange={state.setOutpaintOffsetX}
          onOffsetYChange={state.setOutpaintOffsetY}
          onOutpaintModeChange={state.setOutpaintMode}
          onAutoCropChange={state.setOutpaintAutoCrop}
          onClearMask={() => state.setToolMask("")}
          onRun={() => void state.runWorkspaceTool()}
        />
      ) : (
        <RunPanel
          model={state.model}
          width={state.width}
          height={state.height}
          seed={state.seed}
          seedLocked={state.seedLocked}
          promptUpsampling={state.promptUpsampling}
          normalizeReferences={state.normalizeReferences}
          batchCount={state.batchCount}
          batchMode={state.batchMode}
          selectedPromptCount={state.selectedComboIds.length}
          permutationPairCount={state.permutationPairCount}
          batchProgress={state.batchProgress}
          promptTokens={state.promptTokens}
          promptTokenLimit={state.activeModelConfig.promptTokenLimit}
          estimatedCredits={state.costEstimate.credits}
          estimatedUsd={state.costEstimate.usd}
          costLabel={state.costEstimate.label}
          isGenerating={state.isGenerating}
          generationQueue={state.generationQueue}
          generationQueueSummary={state.generationQueueSummary}
          generationQueueConcurrency={state.generationQueueConcurrency}
          generationQueueControls={state.generationQueueControls}
          error={state.error || state.balance.error || ""}
          onModelChange={state.setModel}
          onWidthChange={state.setWidth}
          onHeightChange={state.setHeight}
          onSeedChange={state.setSeed}
          onSeedLockedChange={state.setSeedLocked}
          onRandomSeed={state.randomizeSeed}
          onPromptUpsamplingChange={state.setPromptUpsampling}
          onNormalizeReferencesChange={state.setNormalizeReferences}
          onBatchCountChange={(value) => state.setBatchCount(clampBatchCount(value))}
          onBatchModeChange={state.setBatchMode}
          onGenerate={() => void state.generate()}
        />
      )}
    </section>
  );
}
