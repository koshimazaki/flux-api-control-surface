import { KeyRound } from "lucide-react";

type TopBarProps = {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
};

export function TopBar({ apiKey, onApiKeyChange }: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">BFL / FLUX.2</p>
        <h1>BFL API Dashboard</h1>
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
