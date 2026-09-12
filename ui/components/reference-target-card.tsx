import { Images, Mountain, Move, Palette, Plus, UserRound, X } from "lucide-react";
import { useRef, type DragEventHandler } from "react";
import { setReferenceDragData } from "@/lib/reference-drag";
import { referenceDisplayName, referencePreviewSrc, referenceRoleConfig, referenceToken, type ReferenceDropTarget } from "@/lib/reference-roles";
import type { ReferenceImage, ReferenceRole } from "@/lib/types";

const roleIcons: Record<ReferenceRole, typeof UserRound> = {
  character: UserRound, style: Palette, environment: Mountain, pose: Move, loose: Images
};

type Props = {
  target: ReferenceDropTarget;
  references: { reference: ReferenceImage; index: number }[];
  className: string;
  onDragOver: DragEventHandler;
  onDragLeave: DragEventHandler;
  onDrop: DragEventHandler;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export function ReferenceTargetCard({ target, references, onFiles, onRemove, ...events }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const RoleIcon = roleIcons[target.role];
  const title = <span className="referenceRoleTitle"><span><RoleIcon size={14} /><strong>{target.label}</strong></span></span>;
  const meta = <span className="referenceRoleMeta"><small>{target.hint}</small><code>{target.token}</code></span>;
  return <>
    <input ref={input} type="file" accept="image/*" multiple hidden aria-label={`Upload ${target.label} references`}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files || []).filter((file) => file.type.startsWith("image/"));
        if (files.length) onFiles(files);
        event.currentTarget.value = "";
      }} />
    {references.length ? (
      <div {...events} title={referenceRoleConfig(target.role).cue}>
        <div className="referenceRoleCardHeader">{title}
          <button type="button" className="referenceCardAdd" title={`Add ${target.label} reference`} onClick={() => input.current?.click()}><Plus size={13} /></button>
        </div>
        {meta}
        <div className="referenceRoleThumbs">
          {references.slice(0, 4).map(({ reference, index }) => {
            const preview = referencePreviewSrc(reference);
            return <div className="referenceRoleThumb" key={reference.id}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={referenceDisplayName(reference, index)} draggable
                  onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)} />
              ) : <span draggable onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}>{referenceToken(index)}</span>}
              <button type="button" className="referenceThumbRemove" title={`Remove ${referenceToken(index)}`} onClick={() => onRemove(reference.id)}><X size={12} /></button>
              <em>{referenceToken(index)}</em>
            </div>;
          })}
        </div>
      </div>
    ) : (
      <button {...events} type="button" title={`Add ${target.label} reference — or drop an image anywhere on this card`}
        onClick={() => input.current?.click()}>
        {title}{meta}
        <span className="referenceCardHint"><Plus size={13} /> Drop image or click to add</span>
      </button>
    )}
  </>;
}
