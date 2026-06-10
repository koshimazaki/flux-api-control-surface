import {
  Bot,
  Clipboard,
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  FolderUp,
  PackagePlus,
  Trash2,
  X
} from "lucide-react";
import type { ChangeEvent } from "react";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { copyText } from "@/lib/clipboard";
import type { TrainingCollection } from "@/lib/types";

type TrainingCollectionsPanelProps = {
  collection: TrainingCollection;
  selectedAssetCount: number;
  captionJob?: {
    status: string;
    jobDir?: string;
    error?: string;
  } | null;
  isSpawningCaptionAgent: boolean;
  isSyncingReferences: boolean;
  isImportingReferences: boolean;
  remoteReferenceCount: number | null;
  referenceIndexUrl: string;
  onCollectionChange: (collection: TrainingCollection) => void;
  onAddSelectedAssets: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveItem: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onExportZip: () => void;
  onSpawnCaptionAgent: () => void;
  onCopyCaptionPrompt: () => void;
  onSyncReferences: () => void;
  onImportReferences: () => void;
};

export function TrainingCollectionsPanel(props: TrainingCollectionsPanelProps) {
  const collection = props.collection;

  function updateField(field: keyof TrainingCollection, value: string) {
    props.onCollectionChange({
      ...collection,
      [field]: value,
      updatedAt: Date.now()
    });
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    props.onAddFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  return (
    <section className="assetsPanel collectionsPanel">
      <PanelHeader
        title="Collections"
        subtitle={<>{collection.items.length} image{collection.items.length === 1 ? "" : "s"} ready for LoRA packaging</>}
      >
        <div className="assetActions">
          <button onClick={props.onAddSelectedAssets} disabled={!props.selectedAssetCount}>
            <PackagePlus size={16} />
            Add selected {props.selectedAssetCount ? props.selectedAssetCount : ""}
          </button>
          <label className="fileButton">
            <FolderUp size={16} />
            Add folder
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={onFileInput}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
          </label>
          <button onClick={props.onSyncReferences} disabled={!collection.items.length || props.isSyncingReferences}>
            <CloudUpload size={16} />
            {props.isSyncingReferences ? "Syncing" : "Sync refs"}
          </button>
          <button onClick={props.onImportReferences} disabled={props.isImportingReferences}>
            <CloudDownload size={16} />
            {props.isImportingReferences ? "Importing" : "Import refs"}
          </button>
          <button onClick={() => window.open(props.referenceIndexUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink size={16} />
            HTML
          </button>
          <button onClick={props.onExportZip} disabled={!collection.items.length}>
            <Download size={16} />
            Export ZIP
          </button>
          <button onClick={props.onSpawnCaptionAgent} disabled={!collection.items.length || props.isSpawningCaptionAgent}>
            <Bot size={16} />
            {props.isSpawningCaptionAgent ? "Spawning" : "Agent captions"}
          </button>
        </div>
      </PanelHeader>

      <MetaBox className="collectionCloudBar" label="Cloud references" value={props.remoteReferenceCount ?? "--"} />

      <div className="collectionControls">
        <label>
          Name
          <input value={collection.name} onChange={(event) => updateField("name", event.target.value)} />
        </label>
        <label>
          Trigger token
          <input value={collection.triggerToken} onChange={(event) => updateField("triggerToken", event.target.value)} />
        </label>
        <label className="collectionGuide">
          Caption guide
          <textarea value={collection.captionGuide} onChange={(event) => updateField("captionGuide", event.target.value)} />
        </label>
      </div>

      {props.captionJob && (
        <div className={props.captionJob.error ? "captionJob errorText" : "captionJob statusLine"}>
          {props.captionJob.error || `${props.captionJob.status}${props.captionJob.jobDir ? `: ${props.captionJob.jobDir}` : ""}`}
          {props.captionJob.jobDir && (
            <button onClick={() => void copyText(props.captionJob?.jobDir || "")}>
              <Clipboard size={14} />
              Copy path
            </button>
          )}
        </div>
      )}

      <div className="runLogHeader collectionHeader">
        <span>Caption pairs</span>
        <button onClick={props.onCopyCaptionPrompt}>
          <Clipboard size={15} />
          Copy agent brief
        </button>
      </div>

      <div className="collectionItems">
        {collection.items.map((item, index) => (
          <article className="collectionItem" key={item.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageDataUrl} alt={item.name} />
            <div>
              <div className="collectionItemTop">
                <strong>{String(index + 1).padStart(2, "0")} / {item.name}</strong>
                <button onClick={() => props.onRemoveItem(item.id)} title="Remove from collection">
                  <X size={15} />
                </button>
              </div>
              <textarea
                value={item.caption}
                onChange={(event) => props.onCaptionChange(item.id, event.target.value)}
                placeholder={`${collection.triggerToken}, concise visible caption`}
              />
            </div>
          </article>
        ))}
        {!collection.items.length && (
          <div className="emptyState">
            <div>
              <Trash2 size={18} />
              <p>Select library images or add a folder to build a training collection.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
