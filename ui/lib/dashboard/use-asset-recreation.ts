import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { flux3Recreation, imageRecreation, mergedAssetRecipe, numberSetting, recreationInputAsset, textSetting, type RecreationSeed } from "../asset-recreation";
import { recipeSource } from "../generation-recipe";
import type { Flux3InputMedia, Flux3SourceMode } from "../flux3-video";
import type { AssetRecord, ReferenceImage, WorkspaceMode } from "../types";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Options = {
  assets: AssetRecord[]; setAssets: Setter<AssetRecord[]>; setWorkspaceMode: Setter<WorkspaceMode>;
  setPromptText: Setter<string>; setPromptSourceAssetId: Setter<string | null>; setModel: Setter<string>;
  setWidth: Setter<number>; setHeight: Setter<number>; setSeedValue: Setter<string>; setSeedLocked: Setter<boolean>;
  setPromptUpsampling: Setter<boolean>; setNormalizeReferences: Setter<boolean>; setReferences: (refs: ReferenceImage[]) => void;
  setReferenceCue: (cue: string) => void; setReferenceWeight: (weight: number) => void;
  setBatchMode: (mode: "current") => void; setBatchCount: Setter<number>;
  setFlux3SourceMode: Setter<Flux3SourceMode>; setFlux3Keyframes: Setter<Flux3InputMedia[]>; setFlux3StartVideo: Setter<Flux3InputMedia | null>;
  setSourceAssetIdForMode: (mode: "erase" | "vto" | "outpaint" | "deblur", id: string | null) => void;
  setVtoGarmentAssetIds: Setter<(string | null)[]>; setToolMask: Setter<string>; setVtoPromptText: Setter<string>; setOutpaintPromptText: Setter<string>;
  setToolDilatePixels: Setter<number>; setToolGuidance: Setter<number>; setToolSteps: Setter<number>; setToolSafetyTolerance: Setter<number>;
  setToolOutputFormat: Setter<"png" | "jpeg" | "webp">; setOutpaintOffsetX: Setter<string>; setOutpaintOffsetY: Setter<string>;
  setOutpaintMode: Setter<"high" | "fast">; setOutpaintAutoCrop: Setter<boolean>; setRecoveryMessage: Setter<string>;
};

export function useAssetRecreation(o: Options) {
  const [videoRecreation, setVideoRecreation] = useState<RecreationSeed | null>(null);
  const requestVersion = useRef(0);
  async function recreateAsset(asset: AssetRecord) {
    const version = ++requestVersion.current;
    o.setRecoveryMessage(`Loading saved settings for ${asset.title || asset.id}…`);
    try {
      const response = await fetch(`/api/outputs/recreate/${encodeURIComponent(asset.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read the saved settings. Please try again.");
      const data = await response.json();
      if (version !== requestVersion.current) return;
      const recipe = mergedAssetRecipe(asset, data.recipe), b = recipe.body;
      let missing = 0;
      if (recipe.kind === "video") {
        if (recipe.operation === "video-edit" || recipe.operation === "video-upscale") {
          o.setWorkspaceMode(recipe.operation === "video-edit" ? "edit" : "upscale");
          if (!recipeSource(b.inputVideo)) missing++;
        } else {
          if (recipe.operation === "draft_enhance") {
            // Restore the originating generation, not a draft-cache control that
            // the Frames editor cannot represent.
            const sourceId = textSetting(b.draftCacheId);
            const original = o.assets.find(item => item.id === sourceId);
            if (original) { await recreateAsset(original); return; }
            throw new Error("The original draft is unavailable. Select its saved generation to recreate it.");
          }
          const settings = flux3Recreation(recipe);
          o.setFlux3SourceMode(settings.mode); o.setFlux3Keyframes(settings.keyframes); o.setFlux3StartVideo(settings.startVideo);
          o.setWorkspaceMode("flux3"); missing += settings.missing;
        }
        setVideoRecreation(current => ({ recipe, nonce: (current?.nonce || 0) + 1 }));
      } else if (recipe.kind === "tool") {
        const mode = recipe.operation;
        if (mode !== "erase" && mode !== "vto" && mode !== "outpaint" && mode !== "deblur") throw new Error("This tool cannot yet restore saved settings.");
        const original = o.assets.find(item => item.id === b.sourceAssetId);
        const input = recreationInputAsset(asset, recipeSource(b.image), "source", original);
        const garments = (Array.isArray(b.garments) ? b.garments : b.garment ? [b.garment] : []).map((source, index) => recreationInputAsset(asset, recipeSource(source), `garment-${index + 1}`));
        const garmentIds = Array.isArray(b.garmentAssetIds) ? b.garmentAssetIds : [];
        const resolvedGarments = garmentIds.length ? garmentIds.map((id, index) => o.assets.find(item => item.id === id) || garments[index] || null) : garments;
        const inputs = [input, ...resolvedGarments].filter((item): item is AssetRecord => Boolean(item));
        o.setAssets(current => [...inputs.filter(item => !current.some(existing => existing.id === item.id)), ...current]);
        o.setSourceAssetIdForMode(mode, input?.id || null); o.setToolMask(recipeSource(b.mask));
        o.setVtoGarmentAssetIds(Array.from({ length: 4 }, (_, index) => resolvedGarments[index]?.id || null));
        o.setVtoPromptText(textSetting(b.prompt)); o.setOutpaintPromptText(textSetting(b.prompt));
        o.setToolDilatePixels(numberSetting(b.dilatePixels, 10)); o.setToolGuidance(numberSetting(b.guidance, 30)); o.setToolSteps(numberSetting(b.steps, 50));
        o.setToolSafetyTolerance(numberSetting(b.safetyTolerance, 2)); o.setToolOutputFormat(b.outputFormat === "jpeg" || b.outputFormat === "webp" ? b.outputFormat : "png");
        o.setWidth(numberSetting(b.canvasWidth, 1024)); o.setHeight(numberSetting(b.canvasHeight, 1024));
        o.setOutpaintOffsetX(String(numberSetting(b.offsetX, 0))); o.setOutpaintOffsetY(String(numberSetting(b.offsetY, 0)));
        o.setOutpaintMode(b.mode === "fast" ? "fast" : "high"); o.setOutpaintAutoCrop(Boolean(b.autoCrop));
        o.setSeedValue(typeof b.seed === "number" ? String(b.seed) : ""); o.setSeedLocked(typeof b.seed === "number");
        o.setWorkspaceMode(mode);
        missing += !input ? 1 : 0;
        if (mode === "erase" && !recipeSource(b.mask)) missing++;
        if (mode === "vto" && !resolvedGarments.filter(Boolean).length) missing++;
      } else {
        const settings = imageRecreation(asset, recipe, o.assets);
        o.setModel(settings.model); o.setWidth(settings.width); o.setHeight(settings.height);
        o.setSeedValue(settings.seed); o.setSeedLocked(Boolean(settings.seed)); o.setPromptText(settings.prompt); o.setPromptSourceAssetId(null);
        o.setPromptUpsampling(settings.promptUpsampling); o.setNormalizeReferences(settings.normalizeReferences);
        o.setReferences(settings.references); o.setReferenceCue(settings.referenceCue); o.setReferenceWeight(settings.referenceWeight);
        o.setBatchMode("current"); o.setBatchCount(1); o.setWorkspaceMode("prompt"); missing += settings.missing;
      }
      o.setRecoveryMessage(`Loaded settings from ${asset.title || asset.id}. ${missing ? `${missing} saved input${missing > 1 ? "s are" : " is"} unavailable; add the missing media before generating.` : "Ready to adjust and generate."}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (version === requestVersion.current) o.setRecoveryMessage(error instanceof Error ? error.message : "Could not restore this generation.");
    }
  }
  return { recreateAsset, videoRecreation };
}
