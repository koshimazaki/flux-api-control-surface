import { KeyRound } from "lucide-react";

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
          <h1>BFL API Dashboard</h1>
        </div>
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
    </header>
  );
}
