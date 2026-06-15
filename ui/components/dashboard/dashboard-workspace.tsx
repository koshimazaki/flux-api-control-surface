import { ImageToolWorkspace } from "@/components/image-tool-workspace";
import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
import { ToolRunPanel } from "@/components/tool-run-panel";
import { clampBatchCount, clampReferenceWeight } from "@/lib/dashboard-generation";
import { downloadText, formatPrompt } from "@/lib/prompt-utils";
import type { DashboardState } from "@/lib/use-dashboard-state";

export function DashboardWorkspace({ state }: { state: DashboardState }) {
  const imageToolMode = state.workspaceMode === "prompt" ? null : state.workspaceMode;

  return (
    <section className="workspace">
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
            onMaskChange={state.setToolMask}
            onClearSource={state.clearToolSourceAsset}
          />
        ) : (
          <PromptEditor
            activePrompt={state.activePrompt}
            promptText={state.promptText}
            onPromptChange={state.setPromptText}
            references={state.references}
            submittedReferenceCue={state.effectiveReferenceCue}
            promptSourceAsset={state.promptSourceAsset}
            onReferenceDropPayload={state.addAssetToPromptReferences}
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
          promptText={state.promptText}
          mask={state.toolMask}
          brushSize={state.toolBrushSize}
          dilatePixels={state.toolDilatePixels}
          offsetX={state.outpaintOffsetX}
          offsetY={state.outpaintOffsetY}
          outpaintMode={state.outpaintMode}
          isGenerating={state.isGenerating}
          error={state.error || state.balance.error || ""}
          onWidthChange={state.setWidth}
          onHeightChange={state.setHeight}
          onSeedChange={state.setSeed}
          onPromptChange={state.setPromptText}
          onBrushSizeChange={state.setToolBrushSize}
          onDilatePixelsChange={state.setToolDilatePixels}
          onOffsetXChange={state.setOutpaintOffsetX}
          onOffsetYChange={state.setOutpaintOffsetY}
          onOutpaintModeChange={state.setOutpaintMode}
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
          primaryReferenceUrl={state.primaryReferenceUrl}
          primaryReferencePreview={state.primaryReferencePreview}
          referenceWeight={state.referenceWeight}
          referenceCue={state.referenceCue}
          promptTokens={state.promptTokens}
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
