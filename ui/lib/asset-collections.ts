import type {
  AssetCollection,
  AssetCollectionMember,
  AssetCollectionMemberKind,
  AssetRecord
} from "./types";

export const ASSET_COLLECTIONS_CACHE_KEY = "bfl-asset-collections";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function slugifyCollectionName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function collectionId(name: string, now = Date.now()) {
  const slug = slugifyCollectionName(name) || "collection";
  return `collection-${slug}-${now.toString(36)}`;
}

function isMemberKind(value: unknown): value is AssetCollectionMemberKind {
  return value === "input" || value === "generation" || value === "asset";
}

export function inferCollectionMemberKind(asset: AssetRecord): AssetCollectionMemberKind {
  if (asset.assetKind === "output" || /bfl|flux/i.test(`${asset.provider || ""} ${asset.model || ""}`)) {
    return "generation";
  }
  if (asset.assetKind === "asset" || asset.operation === "glyphs") return "asset";
  return "input";
}

export function collectionMemberFromAsset(
  asset: AssetRecord,
  kind: AssetCollectionMemberKind = inferCollectionMemberKind(asset),
  now = Date.now()
): AssetCollectionMember {
  return {
    assetId: asset.id,
    kind,
    name: asset.title || asset.id,
    localImagePath: asset.localImagePath ?? null,
    addedAt: now
  };
}

export function collectionMembersFromAssets(
  assets: AssetRecord[],
  kind?: AssetCollectionMemberKind,
  now = Date.now()
): AssetCollectionMember[] {
  const seen = new Set<string>();
  let order = 0;
  return assets
    .map((asset) => {
      if (!asset.id || seen.has(asset.id)) return null;
      seen.add(asset.id);
      const member = collectionMemberFromAsset(asset, kind, now + order);
      order += 1;
      return member;
    })
    .filter((member): member is AssetCollectionMember => Boolean(member));
}

export function normalizeCollectionMember(value: unknown): AssetCollectionMember | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const assetId = cleanText(raw.assetId);
  if (!assetId) return null;
  return {
    assetId,
    kind: isMemberKind(raw.kind) ? raw.kind : "input",
    role: raw.role === "character" || raw.role === "style" || raw.role === "environment" || raw.role === "pose" || raw.role === "loose" ? raw.role : undefined,
    name: cleanText(raw.name) || undefined,
    localImagePath: typeof raw.localImagePath === "string" ? raw.localImagePath : null,
    addedAt: typeof raw.addedAt === "number" && Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now()
  };
}

export function mergeCollectionMembers(
  current: AssetCollectionMember[],
  incoming: AssetCollectionMember[]
): AssetCollectionMember[] {
  const byId = new Map<string, AssetCollectionMember>();
  current.forEach((member) => byId.set(member.assetId, member));
  incoming.forEach((member) => {
    const existing = byId.get(member.assetId);
    byId.set(member.assetId, {
      ...existing,
      ...member,
      addedAt: existing?.addedAt || member.addedAt
    });
  });
  return Array.from(byId.values()).sort((left, right) => left.addedAt - right.addedAt);
}

export function removeCollectionMember(collection: AssetCollection, assetId: string): AssetCollection {
  const nextMembers = collection.members.filter((member) => member.assetId !== assetId);
  const nextCover = (collection.cover || []).filter((id) => id !== assetId);
  return {
    ...collection,
    members: nextMembers,
    cover: nextCover.length ? nextCover : undefined,
    updatedAt: Date.now()
  };
}

export function createAssetCollection(input: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  favorite?: unknown;
  cover?: unknown;
  members?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): AssetCollection {
  const now = Date.now();
  const name = cleanText(input.name) || "Untitled collection";
  const members = Array.isArray(input.members)
    ? input.members.map(normalizeCollectionMember).filter((member): member is AssetCollectionMember => Boolean(member))
    : [];
  const cover = Array.isArray(input.cover)
    ? input.cover.map(cleanText).filter(Boolean).slice(0, 4)
    : undefined;

  return {
    id: cleanText(input.id) || collectionId(name, now),
    name,
    description: cleanText(input.description) || undefined,
    favorite: Boolean(input.favorite),
    cover,
    members: mergeCollectionMembers([], members),
    createdAt: typeof input.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : now
  };
}

export function normalizeAssetCollection(value: unknown): AssetCollection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const collection = createAssetCollection(value as Record<string, unknown>);
  if (!collection.id || !collection.name) return null;
  if (typeof (value as Record<string, unknown>).deletedAt === "number") {
    collection.deletedAt = (value as Record<string, number>).deletedAt;
  }
  return collection;
}

export function normalizeAssetCollections(value: unknown): AssetCollection[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { collections?: unknown[] }).collections)
      ? (value as { collections: unknown[] }).collections
      : [];
  const seen = new Set<string>();
  return raw
    .map(normalizeAssetCollection)
    .filter((collection): collection is AssetCollection => {
      if (!collection || collection.deletedAt || seen.has(collection.id)) return false;
      seen.add(collection.id);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function upsertAssetCollection(
  collections: AssetCollection[],
  collection: AssetCollection
): AssetCollection[] {
  const index = collections.findIndex((item) => item.id === collection.id);
  const next = collections.slice();
  if (index >= 0) next[index] = collection;
  else next.unshift(collection);
  return next.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function collectionCoverAssetIds(collection: AssetCollection) {
  const ids = collection.cover?.length ? collection.cover : collection.members.map((member) => member.assetId);
  return Array.from(new Set(ids)).slice(0, 4);
}

export function collectionMemberCounts(collection: AssetCollection) {
  return collection.members.reduce(
    (counts, member) => {
      if (member.kind === "generation") counts.generations += 1;
      else counts.inputs += 1;
      return counts;
    },
    { inputs: 0, generations: 0 }
  );
}
