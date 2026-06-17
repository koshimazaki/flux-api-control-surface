"use client";
import { BackgroundShader } from "@/components/background-shader";
import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { Lightbox } from "@/components/lightbox";
import { TopBar } from "@/components/top-bar";
import { useDashboardState } from "@/lib/use-dashboard-state";

export default function Home() {
  const state = useDashboardState();
  return (
    <>
      <BackgroundShader />
      <main className="shell">
        <TopBar apiKey={state.apiKey} onApiKeyChange={state.setApiKey} />
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
