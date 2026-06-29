import { Dice5, Lock, Unlock } from "lucide-react";

type SeedControlProps = {
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
  onRandomize: () => void;
  onLockedChange: (value: boolean) => void;
};

export function SeedControl({ value, locked, onChange, onRandomize, onLockedChange }: SeedControlProps) {
  return (
    <div className="seedControl">
      <label className="seedField">
        Seed
        <input
          value={value}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          placeholder="random"
        />
      </label>
      <button type="button" className="seedIconButton" onClick={onRandomize} title="New random seed">
        <Dice5 size={16} />
      </button>
      <button
        type="button"
        className={locked ? "seedLockButton selected" : "seedLockButton"}
        onClick={() => onLockedChange(!locked)}
        title={locked ? "Unlock seed" : "Lock seed"}
      >
        {locked ? <Lock size={15} /> : <Unlock size={15} />}
        {locked ? "Locked" : "Auto"}
      </button>
    </div>
  );
}
