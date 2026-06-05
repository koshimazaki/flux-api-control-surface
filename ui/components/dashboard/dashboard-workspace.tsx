import { PromptEditor } from "@/components/prompt-editor";
import { PromptLibrary } from "@/components/prompt-library";
import { RunPanel } from "@/components/run-panel";
import { clampBatchCount, clampReferenceWeight } from "@/lib/dashboard-generation";
import { downloadText, formatPrompt } from "@/lib/prompt-utils";
import type { DashboardState } from "@/lib/use-dashboard-state";

export function DashboardWorkspace({ state }: { state: DashboardState }) {
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
      <PromptEditor
        activePrompt={state.activePrompt}
        promptText={state.promptText}
        onPromptChange={state.setPromptText}
        onImport={state.importPromptJson}
        onSave={() => void state.savePrompt()}
        onSaveAsNew={() => void state.savePrompt(true)}
        onDelete={() => void state.deletePrompt()}
        onReset={() => state.setPromptText(formatPrompt(state.activePrompt?.prompt || state.promptText))}
      />
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
        onGenerate={() => void state.generate()}
      />
    </section>
  );
}
