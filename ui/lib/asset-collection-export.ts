import { downloadNameForAsset, extensionForAsset } from "./dashboard-assets";
import { downloadZip, sanitizeZipName, type ZipEntry } from "./zip-archive";
import type { AssetCollection, AssetCollectionMember, AssetRecord } from "./types";

function assetSource(asset: AssetRecord) {
  return asset.imageDataUrl || asset.sampleUrl || asset.remoteImageUrl || asset.imageUrl || asset.image_url;
}

function filePrefix(member: AssetCollectionMember) {
  if (member.kind === "generation") return "generations";
  if (member.kind === "asset") return "assets";
  return "inputs";
}

function dataUrlBytes(dataUrl: string) {
  const [header = "", payload = ""] = dataUrl.split(",", 2);
  if (!header.includes(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function imageBytes(source: string) {
  if (source.startsWith("data:")) return dataUrlBytes(source);
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not fetch ${source}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function buildAssetCollectionZipEntries(collection: AssetCollection, assets: AssetRecord[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const exportedItems: Array<{
    assetId: string;
    kind: AssetCollectionMember["kind"];
    name?: string;
    file: string;
    promptFile?: string;
    title?: string;
    model?: string;
    provider?: string;
    width?: number;
    height?: number;
    localImagePath?: string | null;
    remoteImageUrl?: string | null;
  }> = [];
  const skippedDetails: Array<{ assetId: string; kind: AssetCollectionMember["kind"]; reason: string }> = [];
  const skipped: string[] = [];

  entries.push(
    {
      name: "collection.json",
      bytes: encoder.encode(JSON.stringify(collection, null, 2))
    }
  );

  for (const [index, member] of collection.members.entries()) {
    const asset = byId.get(member.assetId);
    const source = asset ? assetSource(asset) : "";
    if (!asset || !source) {
      skippedDetails.push({
        assetId: member.assetId,
        kind: member.kind,
        reason: asset ? "No image source was available in the gallery record." : "Asset is not loaded in the gallery."
      });
      skipped.push(member.assetId);
      continue;
    }
    try {
      const base = sanitizeZipName(`${String(index + 1).padStart(2, "0")}-${downloadNameForAsset(asset)}`);
      const file = `${filePrefix(member)}/${base}.${extensionForAsset(asset)}`;
      const promptFile = asset.prompt.trim() ? `prompts/${base}.txt` : undefined;
      entries.push({
        name: file,
        bytes: await imageBytes(source)
      });
      if (promptFile) {
        entries.push({
          name: promptFile,
          bytes: encoder.encode(asset.prompt)
        });
      }
      exportedItems.push({
        assetId: member.assetId,
        kind: member.kind,
        name: member.name,
        file,
        promptFile,
        title: asset.title,
        model: asset.model,
        provider: asset.provider,
        width: asset.width,
        height: asset.height,
        localImagePath: asset.localImagePath ?? member.localImagePath ?? null,
        remoteImageUrl: asset.remoteImageUrl ?? null
      });
    } catch (error) {
      skippedDetails.push({
        assetId: member.assetId,
        kind: member.kind,
        reason: error instanceof Error ? error.message : "Image export failed."
      });
      skipped.push(member.assetId);
    }
  }

  entries.push({
    name: "manifest.json",
    bytes: encoder.encode(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          collection: {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt
          },
          counts: {
            members: collection.members.length,
            exported: exportedItems.length,
            skipped: skippedDetails.length
          },
          items: exportedItems,
          skipped: skippedDetails
        },
        null,
        2
      )
    )
  });

  return { entries, skipped, skippedDetails };
}

export async function downloadAssetCollectionZip(collection: AssetCollection, assets: AssetRecord[]) {
  const { entries, skipped } = await buildAssetCollectionZipEntries(collection, assets);
  const fileName = `${sanitizeZipName(collection.name || "asset-collection") || "asset-collection"}.zip`;
  downloadZip(entries, fileName);
  return { exported: entries.length, skipped };
}
