import { Film, Image as ImageIcon } from "lucide-react";
import { SelectorGroup, SelectorOption } from "@/components/ui/selector-group";
import type { SelectorVariant } from "@/lib/selector-variants";
import type { WorkspaceMediaKind } from "@/lib/workspace-media";

type WorkspaceMediaSwitchProps = {
  value: WorkspaceMediaKind;
  onChange: (kind: WorkspaceMediaKind) => void;
  variant?: "header" | "rail";
};

const mediaItems = [
  { id: "image" as const, label: "Image", icon: ImageIcon },
  { id: "video" as const, label: "Video", icon: Film }
];

export function WorkspaceMediaSwitch({ value, onChange, variant = "header" }: WorkspaceMediaSwitchProps) {
  const selectorVariant: SelectorVariant = variant === "rail" ? "icon-rail" : "segmented";
  return (
    <SelectorGroup
      variant={selectorVariant}
      className={`workspaceMediaSwitch workspaceMediaSwitch-${variant}`}
      aria-label="Workspace media"
    >
      {mediaItems.map(({ id, label, icon: Icon }) => (
        <SelectorOption
          variant={selectorVariant}
          selected={value === id}
          key={id}
          aria-label={variant === "rail" ? `Show ${label.toLowerCase()} tools and prompts` : undefined}
          title={variant === "rail" ? `${label} tools and prompt library` : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={variant === "rail" ? 16 : 15} />
          {variant === "header" && <span>{label}</span>}
        </SelectorOption>
      ))}
    </SelectorGroup>
  );
}
