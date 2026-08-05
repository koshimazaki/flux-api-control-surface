import { ArrowLeft, ArrowRight, Film, ImagePlus, Upload, X } from "lucide-react";
import { useRef, type ChangeEvent, type DragEvent } from "react";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import type { AssetRecord } from "@/lib/types";
import { flux3MediaFromAsset, type Flux3InputMedia, type Flux3VideoMode } from "@/lib/flux3-video";

export type { Flux3InputMedia } from "@/lib/flux3-video";

const KEYFRAME_INDEX_MIME = "application/x-bfl-keyframe-index";

type Flux3MediaDropzoneProps = {
  mode: Flux3VideoMode;
  assets: AssetRecord[];
  keyframes: Flux3InputMedia[];
  startVideo: Flux3InputMedia | null;
  onKeyframesChange: (items: Flux3InputMedia[]) => void;
  onStartVideoChange: (item: Flux3InputMedia | null) => void;
  onError: (message: string) => void;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function mediaFromFile(file: File, source: string): Flux3InputMedia {
  return {
    id: `file-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    kind: file.type.startsWith("video/") ? "video" : "image",
    source
  };
}

export function Flux3MediaDropzone(props: Flux3MediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const expectsVideo = props.mode === "v2v";

  async function addFiles(files: File[], insertAt = props.keyframes.length) {
    const matching = files.filter((file) => (expectsVideo ? file.type === "video/mp4" : file.type.startsWith("image/")));
    if (!matching.length) {
      props.onError(expectsVideo ? "FLUX.3 continuation accepts an MP4 clip." : "Choose image files for keyframes.");
      return;
    }
    try {
      if (expectsVideo) {
        const file = matching[0];
        props.onStartVideoChange(mediaFromFile(file, await readFileAsDataUrl(file)));
      } else {
        const available = Math.max(0, 10 - props.keyframes.length);
        const media = await Promise.all(
          matching.slice(0, available).map(async (file) => mediaFromFile(file, await readFileAsDataUrl(file)))
        );
        const next = [...props.keyframes];
        next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, ...media);
        props.onKeyframesChange(next);
        if (matching.length > available) props.onError("Only the first ten FLUX.3 keyframes were added.");
      }
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Could not read the dropped media.");
    }
  }

  function addAssetFromDrop(event: DragEvent, insertAt = props.keyframes.length) {
    const payload = event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
    if (!payload.startsWith("asset:")) return false;
    const asset = props.assets.find((item) => item.id === payload.slice("asset:".length));
    const media = asset ? flux3MediaFromAsset(asset) : null;
    if (!media) {
      props.onError("That dashboard asset could not be loaded.");
      return true;
    }
    if (expectsVideo !== (media.kind === "video")) {
      props.onError(expectsVideo ? "Drop a video asset here." : "Drop an image asset here.");
      return true;
    }
    if (expectsVideo) props.onStartVideoChange(media);
    else if (props.keyframes.length < 10) {
      const next = [...props.keyframes];
      next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, media);
      props.onKeyframesChange(next);
    } else props.onError("FLUX.3 accepts up to ten image keyframes.");
    return true;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (addAssetFromDrop(event)) return;
    void addFiles(Array.from(event.dataTransfer.files || []));
  }

  function handleTileDrop(event: DragEvent, tileIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAt = tileIndex + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
    const internal = event.dataTransfer.getData(KEYFRAME_INDEX_MIME);
    if (internal !== "") {
      const from = Number(internal);
      if (!Number.isInteger(from) || from < 0 || from >= props.keyframes.length) return;
      const target = insertAt > from ? insertAt - 1 : insertAt;
      if (target === from) return;
      const next = [...props.keyframes];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      props.onKeyframesChange(next);
      return;
    }
    if (addAssetFromDrop(event, insertAt)) return;
    void addFiles(Array.from(event.dataTransfer.files || []), insertAt);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function moveKeyframe(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= props.keyframes.length) return;
    const next = [...props.keyframes];
    [next[index], next[target]] = [next[target], next[index]];
    props.onKeyframesChange(next);
  }

  if (props.mode === "t2v" || props.mode === "draft_enhance") return null;

  return (
    <section className="flux3MediaSection">
      <div className="flux3SectionHeader">
        <div>
          <strong>{expectsVideo ? "Continuation clip" : "Pinned keyframes"}</strong>
          <span>{expectsVideo ? "MP4 · continues from the final frames" : `${props.keyframes.length}/10 · order becomes the timeline`}</span>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={14} />
          Add {expectsVideo ? "video" : "images"}
        </button>
      </div>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple={!expectsVideo}
        accept={expectsVideo ? "video/mp4" : "image/*"}
        onChange={handleInput}
      />

      {expectsVideo && props.startVideo ? (
        <div className="flux3VideoInput">
          <video src={props.startVideo.source} controls playsInline />
          <div>
            <Film size={15} />
            <span>{props.startVideo.name}</span>
            <button type="button" onClick={() => props.onStartVideoChange(null)} title="Remove video"><X size={14} /></button>
          </div>
        </div>
      ) : expectsVideo ? (
        <button className="flux3MediaDrop" type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <Film size={24} />
          <strong>Drop an MP4 or video asset</strong>
          <span>The generated clip carries on from its final frame and motion.</span>
        </button>
      ) : props.keyframes.length === 0 ? (
        <button className="flux3MediaDrop compact" type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <ImagePlus size={22} />
          <strong>Drop images or dashboard assets</strong>
          <span>One starts the video; two pin start and end; up to ten storyboard the shot. Each image becomes an exact frame on the timeline, not a style reference.</span>
        </button>
      ) : (
        <div className="flux3KeyframeGrid">
          {props.keyframes.map((item, index) => (
            <article
              key={item.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(KEYFRAME_INDEX_MIME, String(index));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleTileDrop(event, index)}
              title="Drag to reorder; drop images between tiles to insert"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.source} alt={item.name} />
              <span>{index + 1}</span>
              <div>
                <button type="button" disabled={index === 0} onClick={() => moveKeyframe(index, -1)} title="Move earlier"><ArrowLeft size={13} /></button>
                <button type="button" disabled={index === props.keyframes.length - 1} onClick={() => moveKeyframe(index, 1)} title="Move later"><ArrowRight size={13} /></button>
                <button type="button" onClick={() => props.onKeyframesChange(props.keyframes.filter((_, itemIndex) => itemIndex !== index))} title="Remove"><X size={13} /></button>
              </div>
            </article>
          ))}
          {props.keyframes.length < 10 && (
            <button
              type="button"
              className="flux3KeyframeAdd"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              title="Drop the next keyframe here, or click to browse"
            >
              <ImagePlus size={18} />
              <span>Drop next</span>
              <small>{props.keyframes.length + 1} of 10</small>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
