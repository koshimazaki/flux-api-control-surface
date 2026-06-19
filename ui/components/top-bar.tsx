import { KeyRound, LockKeyhole, RadioTower, RefreshCcw, Trash2 } from "lucide-react";
import type { ApiKeyStatus } from "@/lib/types";

type TopBarProps = {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  apiKeyStatus: ApiKeyStatus | null;
  isSavingApiKey: boolean;
  onSaveApiKey: () => void;
  onForgetApiKey: () => void;
  onRefreshApiKey: () => void;
};

function sourceLabel(status: ApiKeyStatus | null) {
  if (!status) return "checking";
  if (status.source === "env:BFL_API_KEY") return "BFL env";
  if (status.source === "env:FLUX_API_KEY") return "FLUX env";
  if (status.source === "macos-keychain") return "Keychain";
  return "No key";
}

function sourceTitle(status: ApiKeyStatus | null) {
  if (!status) return "Checking local API key source";
  if (status.source === "macos-keychain") {
    return `Using macOS Keychain item "${status.keychain.service}"`;
  }
  if (status.source.startsWith("env:")) return `Using server ${status.source.replace("env:", "")}`;
  return "No server-side FLUX API key is configured";
}

export function TopBar({
  apiKey,
  onApiKeyChange,
  apiKeyStatus,
  isSavingApiKey,
  onSaveApiKey,
  onForgetApiKey,
  onRefreshApiKey
}: TopBarProps) {
  const canSaveToKeychain = Boolean(apiKeyStatus?.keychain.canWrite);
  const canForgetKeychain = Boolean(apiKeyStatus?.keychain.configured && apiKeyStatus.keychain.canWrite);
  return (
    <header className="topbar">
      <div className="topBarBrand">
        <div className="brandMark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://bfl.ai/brand/symbol-white.svg" alt="" />
        </div>
        <div className="brandCopy">
          <p className="eyebrow">Local FLUX API workbench</p>
          <h1>FLUX API Control Surface</h1>
          <div className="topBarChips" aria-label="Workspace scope">
            <span>API</span>
            <span>Prompts</span>
            <span>Assets</span>
            <span>MCP</span>
          </div>
        </div>
      </div>
      <div className="topBarRight">
        <div className="topBarStatus" aria-label="Runtime status">
          <span><RadioTower size={12} /> Local</span>
          <span>FLUX.2</span>
          <span>R2</span>
        </div>
        <div className="keyBox">
          <KeyRound size={16} />
          <input
            type="password"
            placeholder={apiKeyStatus?.configured ? "Server key configured" : "FLUX API key"}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <span className="keySourceBadge" title={sourceTitle(apiKeyStatus)}>
            {sourceLabel(apiKeyStatus)}
          </span>
          <button
            type="button"
            className="keyIconButton"
            onClick={onSaveApiKey}
            disabled={!canSaveToKeychain || !apiKey.trim() || isSavingApiKey}
            title="Save typed key to macOS Keychain"
          >
            <LockKeyhole size={15} />
          </button>
          <button
            type="button"
            className="keyIconButton"
            onClick={onForgetApiKey}
            disabled={!canForgetKeychain || isSavingApiKey}
            title="Remove dashboard key from macOS Keychain"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            className="keyIconButton"
            onClick={onRefreshApiKey}
            disabled={isSavingApiKey}
            title="Refresh key status"
          >
            <RefreshCcw size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
