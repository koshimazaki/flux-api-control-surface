# Collections — design note

Status: MVP implemented for general gallery collections. Captures the decisions
from the design discussion and the current build shape. Scope remains phased.

## Goal

Let a user group gallery assets into named **Collections** (moodboards / project
folders), shown inline in the main gallery and usable as a unit — most
importantly, **as a reference set an agent can pull into permutations**
("generate variations using the *Abyssal* moodboard as references"). This is the
on-brand payoff: moodboard → audio/permutation-driven generation.

A Collection holds both the **inputs** (references) and the **outputs**
(generations) of an exploration, so it doubles as a lightweight project folder.

## Naming & relationship to the existing feature

- **Collections** = the new, general asset-grouping feature described here.
- The existing `TrainingCollection` (LoRA dataset builder: `triggerToken`,
  `captionGuide`, caption jobs, dataset export) stays as its own workflow and
  tab. To avoid a label clash, relabel it in the UI as **"Training"** (the code
  type can keep its name). Optional later bridge: *Promote Collection →
  Training Collection*.
- Decision still to confirm: keep the new feature named "Collections" (lean) vs
  "Sets"/"Boards". The note uses **Collections**.

## Core principle: metadata, never copies

A Collection stores **references to assets** (by `assetId`), not copied image
bytes. Thumbnails resolve through the existing `/api/outputs/:assetId/image`.
Reasons (see also the reference-persistence fixes): no storage duplication, no
sync rot when assets change, single source of truth.

Physical folders are an **on-demand export action**, not the storage model —
`Export collection → public/assets/collections/<name>/` (or a chosen dir),
reusing the existing `exportCollectionZip` pattern. Members snapshot
`localImagePath` + `name` so an agent can still locate files on disk by
collection name if an in-app record is lost.

## Persist server-side (the part that makes the agent angle work)

Today's `TrainingCollection` is **localStorage-only** — invisible to MCP. For an
agent to use a moodboard as references, Collections must live in a small
**server-side store** (e.g. `outputs/.collections/*.json`) exposed via
`/api/collections`, mirrored to localStorage for snappy UI. Then browser and
agent share the same collections, and they survive a browser clear.

## Data model

```ts
export type CollectionMemberKind = "input" | "generation" | "asset";

export type CollectionMember = {
  assetId: string;
  kind: CollectionMemberKind;       // input/reference vs output/generation vs local asset
  role?: ReferenceRole;             // optional reference role when known
  name?: string;                    // snapshot for resilient on-disk lookup
  localImagePath?: string | null;   // snapshot so the file is findable if the record is lost
  addedAt: number;
};

export type Collection = {
  id: string;
  name: string;
  description?: string;
  favorite?: boolean;
  cover?: string[];                 // up to 4 member assetIds for the folder thumbnail
  members: CollectionMember[];
  createdAt: number;
  updatedAt: number;
};
```

- **Membership lives on the Collection.** Do not also store it on the asset —
  compute the reverse map (`assetId → collectionIds`) client-side for the
  in/out-of-collection badge. One source of truth, no sync rot.

## API surface (`/api/collections`)

The MVP uses one route with query params instead of nested route files:

- `GET    /api/collections`                  — list
- `GET    /api/collections?id=<id>`           — read one collection
- `POST   /api/collections`                  — create `{ name, members? }`
- `PATCH  /api/collections?id=<id>`           — rename / favorite / cover / add members with `addMembers`
- `DELETE /api/collections?id=<id>&assetId=<assetId>` — remove one member
- `DELETE /api/collections?id=<id>`           — delete the collection

Browser export downloads a ZIP from currently resolvable gallery assets. A
server-side materialize/export route is still a later addition.

## MCP tools (Phase 2)

- `list_collections`, `get_collection`
- `add_to_collection`, `create_collection`
- Feed a collection into the existing run-plan/combo engine as the reference set,
  e.g. `generate_permutations_with_collection({ collectionId, ... })`.

This wires the moodboard → permutation workflow end-to-end for an agent.

## UI / UX

- **Inline in the main gallery:** Collection "folder" cards appear among assets,
  cover = up to 4 member thumbnails (iOS-folder style). A filter row scopes the
  view: **All / Images / Collections**.
- **Open a collection:** scoped sub-gallery at normal card size, with a
  breadcrumb back to the full gallery.
- **Membership flag:** a small corner badge on asset cards that belong to ≥1
  collection (hover → which). Reuses the existing `assetBadges` pattern.
- **Add to collection:** both drag-drop (onto a folder card / dock) and a
  send-to-icon, multi-select via the existing `selectedAssetIds`.
- **Management:** the Collections tab lists all collections — rename, delete,
  favorite, set cover, reorder, export.
- **Use as references:** "Use collection as references" loads members
  (`kind === "input"` / `asset`, or all) into the reference working set and/or feeds
  permutations.

## Phasing

1. **Phase 1 (MVP shipped):** data model + `/api/collections` CRUD + localStorage
   mirror + gallery filter (All/Images/Collections) + folder cards + create / add
   / remove / open + membership badge + browser ZIP export.
2. **Phase 2:** use-collection-as-references + permutations + MCP tools.
3. **Phase 3:** export-to-folder/zip, manual cover selection, reorder, favorites
   surfacing; optional *Promote → Training Collection* bridge.

## Open questions

- Confirm the name ("Collections" vs "Sets"/"Boards") and relabel LoRA UI to
  "Training".
- Single `collections.json` vs one file per collection under `outputs/.collections/`.
- Auto cover (first N members) vs manual cover selection (Phase 3).
- Whether `kind` is set explicitly on add, or inferred from the asset's
  `assetKind`/`operation`.

## Touch points in the current code

- Types: `ui/lib/types.ts` (add `Collection`, `CollectionMember`; existing
  `TrainingCollection` stays).
- Existing collection hook to mirror/learn from: `ui/lib/dashboard/use-training-collections.ts`.
- Gallery shell: `ui/components/asset-library.tsx` (filters, controls, normal
  asset cards, `selectedAssetIds`, `assetBadges`).
- Gallery collection variation: `ui/components/asset-collection-gallery.tsx`
  (folder cards and opened collection lanes).
- Server outputs + storage conventions: `ui/lib/server-output-store.ts`,
  `ui/lib/asset-storage.ts`, `ui/lib/bfl-server.ts` (`saveOutputFiles`,
  workspace paths).
- Reference resolution already handles `assetId → /api/outputs/:id/image`:
  `ui/lib/reference-roles.ts` (`referencePreviewSrc`).
