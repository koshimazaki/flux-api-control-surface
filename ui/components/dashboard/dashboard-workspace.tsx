import { BalanceCard } from "@/components/balance-card";
import { ImageToolWorkspace } from "@/components/image-tool-workspace";
import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
import { ToolRunPanel } from "@/components/tool-run-panel";
import { WorkspaceModeTabs } from "@/components/workspace-mode-tabs";
import { clampBatchCount, clampReferenceWeight } from "@/lib/dashboard-generation";
import { downloadText, formatPrompt } from "@/lib/prompt-utils";
import type { DashboardState } from "@/lib/use-dashboard-state";

export function DashboardWorkspace({ state }: { state: DashboardState }) {
  const imageToolMode = state.workspaceMode === "prompt" ? null : state.workspaceMode;
  const toolPromptText =
    imageToolMode === "vto" ? state.vtoPromptText : imageToolMode === "outpaint" ? state.outpaintPromptText : "";
  const setToolPromptText =
    imageToolMode === "vto"
      ? state.setVtoPromptText
      : imageToolMode === "outpaint"
        ? state.setOutpaintPromptText
        : () => undefined;

  return (
    <section className="workspace">
      <WorkspaceModeTabs value={state.workspaceMode} onChange={state.setWorkspaceMode} />
      <BalanceCard
        balanceCredits={state.balance.credits}
        totalActualCredits={state.totalActualCredits}
        isCheckingBalance={state.isCheckingBalance}
        onCheckBalance={state.checkBalance}
      />
      <PromptLibrary
        prompts={state.visiblePrompts}
        libraryOptions={state.promptLibraryOptions}
        activeLibraryId={state.activePromptLibraryId}
        activeId={state.activeId}
        selectedIds={state.selectedComboIds}
        onLibraryChange={state.selectPromptLibrary}
        onSelect={state.selectPrompt}
        onToggleSelected={state.toggleComboPrompt}
        onBuildCombo={state.createComboPrompt}
        onExport={() => downloadText("bfl-flower-prompts.json", JSON.stringify(state.prompts, null, 2))}
      />
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
            onReferenceDropPayload={state.addAssetToPromptReferences}
            onReferenceFiles={state.addPromptReferenceFiles}
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
          error={state.error || state.balance.error || ""}
          onWidthChange={state.setWidth}
          onHeightChange={state.setHeight}
          onSeedChange={state.setSeed}
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
          promptUpsampling={state.promptUpsampling}
          batchCount={state.batchCount}
          batchMode={state.batchMode}
          selectedPromptCount={state.selectedComboIds.length}
          permutationPairCount={state.permutationPairCount}
          batchProgress={state.batchProgress}
          references={state.references}
          maxReferences={state.activeModelConfig.maxReferences}
          primaryReferenceUrl={state.primaryReferenceUrl}
          primaryReferencePreview={state.primaryReferencePreview}
          referenceWeight={state.referenceWeight}
          referenceCue={state.referenceCue}
          promptTokens={state.promptTokens}
          promptTokenLimit={state.activeModelConfig.promptTokenLimit}
          estimatedCredits={state.costEstimate.credits}
          estimatedUsd={state.costEstimate.usd}
          costLabel={state.costEstimate.label}
          isGenerating={state.isGenerating}
          error={state.error || state.balance.error || ""}
          onModelChange={state.setModel}
          onWidthChange={state.setWidth}
          onHeightChange={state.setHeight}
          onSeedChange={state.setSeed}
          onPromptUpsamplingChange={state.setPromptUpsampling}
          onBatchCountChange={(value) => state.setBatchCount(clampBatchCount(value))}
          onBatchModeChange={state.setBatchMode}
          onReferencesChange={state.setReferences}
          onPrimaryReferenceUrlChange={state.setPrimaryReferenceUrl}
          onPrimaryReferenceFiles={state.setPrimaryReferenceFiles}
          onClearPrimaryReference={state.clearPrimaryReference}
          onReferenceWeightChange={(value) => state.setReferenceWeight(clampReferenceWeight(value))}
          onReferenceCueChange={state.setReferenceCue}
          onReferenceFiles={state.addReferenceFiles}
          onReferenceDropPayload={state.addReferenceFromDragPayload}
          onGenerate={() => void state.generate()}
        />
      )}
    </section>
  );
}
