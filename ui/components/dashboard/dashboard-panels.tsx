import { ApisPanel } from "@/components/apis-panel";
import { AssetLibrary } from "@/components/asset-library";
import { AudioScriptPanel } from "@/components/audio-script-panel";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { GenerationLog } from "@/components/generation-log";
import { McpPanel } from "@/components/mcp-panel";
import { ScriptPanel } from "@/components/script-panel";
import { TrainingCollectionsPanel } from "@/components/training-collections-panel";
import { stripAssetForStorage } from "@/lib/asset-storage";
import { downloadText } from "@/lib/prompt-utils";
import type { DashboardState } from "@/lib/use-dashboard-state";

export function DashboardPanels({ state }: { state: DashboardState }) {
  return (
    <DashboardTabs
      activeTab={state.activeTab}
      assetCount={state.assets.length}
      runCount={state.runLog.length}
      collectionCount={state.trainingCollection.items.length}
      scriptCount={state.permutationPairCount}
      onTabChange={state.setActiveTab}
      script={
        <ScriptPanel
          prompts={state.prompts}
          selectedIds={state.selectedComboIds}
          pairCount={state.permutationPairCount}
          estimatedCredits={state.costEstimate.credits * state.permutationPairCount}
          isGenerating={state.isToolGenerating}
          onToggleSelected={state.toggleComboPrompt}
          onSelectAll={state.selectAllPromptSources}
          onClearSelection={state.clearPromptSources}
          onRunScript={state.runPermutationScript}
        />
      }
      audio={
        <AudioScriptPanel
          assets={state.assets}
          collectionItems={state.trainingCollection.items}
          onOpenImage={state.setSelectedAsset}
          onUsePrompt={(value) => {
            state.setPromptText(value);
            state.setRecoveryMessage("Loaded audio shot script into the prompt editor.");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSavePrompt={(value) => void state.saveSequencePrompt(value)}
          onAssignmentsChange={state.setAudioAssignments}
        />
      }
      assets={
        <AssetLibrary
          assets={state.assets}
          filteredAssets={state.filteredAssets}
          searchQuery={state.searchQuery}
          gridSize={state.gridSize}
          aspectRatio={state.aspectRatio}
          metadataAssetId={state.metadataAssetId}
          selectedAssetIds={state.selectedAssetIds}
          assetBadges={state.assetBadges}
          onSearchChange={state.setSearchQuery}
          onGridSizeChange={state.setGridSize}
          onAspectRatioChange={state.setAspectRatio}
          onExport={() =>
            downloadText("bfl-flower-assets.json", JSON.stringify(state.assets.map(stripAssetForStorage), null, 2))
          }
          onClear={state.clearAssets}
          onRecover={state.recoverStoredAssets}
          onImportImages={(files) => void state.importImageAssetFiles(files)}
          onToggleFavorite={state.toggleFavorite}
          onSendToPrompt={state.sendAssetToPrompt}
          onSendToWorkspace={state.sendAssetToWorkspace}
          onSendToVtoGarment={state.sendAssetToNextVtoGarment}
          onSendToReference={state.sendAssetToReference}
          onSavePromptToLibrary={(asset) => void state.saveAssetPromptToLibrary(asset)}
          onToggleSelected={state.toggleAssetSelection}
          onToggleMetadata={(id) => state.setMetadataAssetId(state.metadataAssetId === id ? null : id)}
          onOpen={state.setSelectedAsset}
          onDownload={state.downloadAssetImage}
          onDelete={state.deleteAsset}
        />
      }
      runs={
        <GenerationLog
          entries={state.runLog}
          onExport={() => downloadText("bfl-run-log.json", JSON.stringify(state.runLog, null, 2))}
          onClear={() => state.setRunLog([])}
        />
      }
      collections={
        <TrainingCollectionsPanel
          collection={state.trainingCollection}
          selectedAssetCount={state.selectedAssetIds.length}
          captionJob={state.captionJob}
          isSpawningCaptionAgent={state.isSpawningCaptionAgent}
          isSyncingReferences={state.isSyncingReferences}
          isImportingReferences={state.isImportingReferences}
          remoteReferenceCount={state.remoteReferenceCount}
          referenceIndexUrl="/api/reference-archive?format=html"
          onCollectionChange={state.setTrainingCollection}
          onAddSelectedAssets={state.addSelectedAssetsToCollection}
          onAddFiles={state.addCollectionFiles}
          onRemoveItem={state.removeCollectionItem}
          onCaptionChange={state.updateCollectionCaption}
          onExportZip={state.exportTrainingZip}
          onSpawnCaptionAgent={state.spawnCaptionAgent}
          onCopyCaptionPrompt={state.copyCaptionBrief}
          onSyncReferences={state.syncCollectionReferences}
          onImportReferences={state.importRemoteReferences}
        />
      }
      apis={<ApisPanel captionJobPath={state.captionJob?.jobDir} />}
      mcp={
        <McpPanel
          model={state.model}
          width={state.width}
          height={state.height}
          batchCount={state.batchCount}
          batchMode={state.batchMode}
          selectedPromptIds={state.selectedComboIds}
          runPlanPayload={state.runPlanPayload}
          prompt={state.promptForRun}
          promptTokens={state.promptTokens}
          referencesCount={state.references.filter((reference) => Boolean(reference.value)).length}
          balance={state.balance}
          runLog={state.runLog}
        />
      }
    />
  );
}
