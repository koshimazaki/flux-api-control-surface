"use client";
import { BackgroundShader } from "@/components/background-shader";
import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { Lightbox } from "@/components/lightbox";
import { ReferenceDock } from "@/components/reference-dock";
import { TopBar } from "@/components/top-bar";
import { useDashboardState } from "@/lib/use-dashboard-state";

export default function Home() {
  const state = useDashboardState();
  return (
    <>
      <BackgroundShader />
      <main className="shell">
        <TopBar
          apiKey={state.apiKey}
          onApiKeyChange={state.setApiKey}
          apiKeyStatus={state.apiKeyStatus}
          isSavingApiKey={state.isSavingApiKey}
          onSaveApiKey={state.saveApiKeyToSecureStore}
          onForgetApiKey={state.forgetSecureApiKey}
          onRefreshApiKey={() => void state.refreshApiKeyStatus()}
        />
        <ReferenceDock
          mode={state.workspaceMode}
          references={state.references}
          maxReferences={state.activeModelConfig.maxReferences}
          sourceAsset={state.toolSourceAsset}
          vtoGarmentAssets={state.vtoGarmentSlots}
          onReferencesChange={state.setReferences}
          onReferenceDropPayload={state.addReferenceFromDragPayload}
          onReferenceFiles={state.addReferenceFiles}
          onSourceDropPayload={(payload) => void state.loadToolSourceFromDropPayload(payload)}
          onSourceFiles={(files) => void state.importToolSourceFiles(files)}
          onClearSource={state.clearToolSourceAsset}
          onVtoGarmentDropPayload={(slotIndex, payload) => void state.loadVtoGarmentFromDropPayload(slotIndex, payload)}
          onVtoGarmentFiles={(slotIndex, files) => void state.importVtoGarmentFiles(slotIndex, files)}
          onClearVtoGarment={state.clearVtoGarment}
        />
        <DashboardWorkspace state={state} />
        {state.recoveryMessage && (
          <p className="statusLine">
            {state.recoveryMessage}
            {state.lastDeletedPrompt && (
              <button type="button" className="statusUndo" onClick={() => void state.undoDeletePrompt()}>
                Undo delete
              </button>
            )}
          </p>
        )}
        <DashboardPanels state={state} />
        <Lightbox
          asset={state.selectedAsset}
          onClose={() => state.setSelectedAsset(null)}
          onSendToPrompt={state.sendAssetToPrompt}
          onSendToWorkspace={state.sendAssetToWorkspace}
          onSendToReference={state.sendAssetToReference}
          onDownload={state.downloadAssetImage}
        />
      </main>
    </>
  );
}
