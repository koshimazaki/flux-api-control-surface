import { WaitField } from "@/components/ui/wait-field";

type GenerationWaitProps = { id?: string; label?: string; detail?: string };

/** One waiting field for image, video, tool stages and gallery placeholders. */
export function GenerationWait({ id, label = "Generating", detail }: GenerationWaitProps) {
  return (
    <div className="generationWait" role="status" aria-label={label}>
      <WaitField id={id} active />
      <div className="generationWaitStatus">
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}
