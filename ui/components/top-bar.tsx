import { KeyRound, RadioTower } from "lucide-react";

type TopBarProps = {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
};

export function TopBar({ apiKey, onApiKeyChange }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topBarBrand">
        <div className="brandMark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://bfl.ai/brand/symbol-white.svg" alt="" />
        </div>
        <div className="brandCopy">
          <p className="eyebrow">Black Forest Labs / FLUX.2</p>
          <h1>FLUX Control</h1>
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
            placeholder="BFL API key or .env.local"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
        </div>
      </div>
    </header>
  );
}
