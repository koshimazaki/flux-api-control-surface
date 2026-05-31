export interface Env {
  BFL_OUTPUTS: R2Bucket;
  DB: D1Database;
  BFL_ASSET_WORKER_TOKEN: string;
  ALLOWED_ORIGIN?: string;
}

type UploadBody = {
  id?: string;
  title?: string;
  prompt?: string;
  imageBase64?: string;
  imageDataUrl?: string;
  contentType?: string;
  extension?: string;
  fileBaseName?: string;
  metadata?: Record<string, any>;
};

type ImageUploadBody = Pick<UploadBody, "imageBase64" | "imageDataUrl" | "contentType" | "extension">;

type ReferenceUploadBody = ImageUploadBody & {
  id?: string;
  setId?: string;
  setName?: string;
  title?: string;
  fileName?: string;
  prompt?: string;
  caption?: string;
  metadata?: Record<string, any>;
};

type AssetRow = {
  id: string;
  title: string;
  prompt: string;
  model: string | null;
  width: number | null;
  height: number | null;
  seed: number | null;
  provider: string;
  sample_url: string | null;
  r2_image_key: string;
  r2_prompt_key: string;
  r2_metadata_key: string;
  cost_credits: number | null;
  input_mp: number | null;
  output_mp: number | null;
  credits_before: number | null;
  credits_after: number | null;
  credit_delta: number | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

type ReferenceRow = {
  id: string;
  set_id: string;
  set_name: string | null;
  title: string;
  file_name: string;
  prompt: string | null;
  caption: string | null;
  mime_type: string;
  r2_image_key: string;
  r2_metadata_key: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

let schemaPromise: Promise<void> | null = null;
const R2_ROOT_PREFIX = "BFL-API";
const R2_OUTPUTS_PREFIX = `${R2_ROOT_PREFIX}/outputs`;
const R2_REFERENCES_PREFIX = `${R2_ROOT_PREFIX}/references`;

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "*";
  const allowedOrigins = allowed.split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin =
    allowed === "*" || !origin
      ? "*"
      : allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0] || origin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-BFL-Asset-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(request: Request, env: Env, data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders(request, env)
  });
}

function unauthorized(request: Request, env: Env) {
  return json(request, env, { error: "Missing or invalid archive token" }, 401);
}

function authError(request: Request, env: Env) {
  if (!env.BFL_ASSET_WORKER_TOKEN) {
    return json(request, env, { error: "BFL_ASSET_WORKER_TOKEN secret is not configured" }, 503);
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = request.headers.get("x-bfl-asset-token");
  return bearer === env.BFL_ASSET_WORKER_TOKEN || headerToken === env.BFL_ASSET_WORKER_TOKEN
    ? null
    : unauthorized(request, env);
}

async function ensureSchema(env: Env) {
  schemaPromise ||= Promise.all([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT,
        width INTEGER,
        height INTEGER,
        seed INTEGER,
        provider TEXT NOT NULL DEFAULT 'bfl-api',
        sample_url TEXT,
        r2_image_key TEXT NOT NULL,
        r2_prompt_key TEXT NOT NULL,
        r2_metadata_key TEXT NOT NULL,
        cost_credits REAL,
        input_mp REAL,
        output_mp REAL,
        credits_before REAL,
        credits_after REAL,
        credit_delta REAL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run(),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC)").run(),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS reference_items (
        id TEXT PRIMARY KEY,
        set_id TEXT NOT NULL,
        set_name TEXT,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        prompt TEXT,
        caption TEXT,
        mime_type TEXT NOT NULL,
        r2_image_key TEXT NOT NULL,
        r2_metadata_key TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run(),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_reference_items_set_id ON reference_items(set_id)").run(),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_reference_items_created_at ON reference_items(created_at DESC)").run()
  ]).then(() => undefined);
  return schemaPromise;
}

function cleanSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function baseNameWithoutExtension(value: string) {
  const clean = cleanSegment(value);
  return clean.replace(/\.(png|jpe?g|webp)$/i, "") || clean || "image";
}

function extensionFor(contentType: string, requested?: string) {
  if (requested === "webp" || contentType.includes("webp")) return "webp";
  if (requested === "jpg" || requested === "jpeg" || contentType.includes("jpeg")) return "jpg";
  return "png";
}

function decodeImage(body: ImageUploadBody) {
  const dataUrl = body.imageDataUrl || "";
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = body.contentType || match?.[1] || "image/png";
  const base64 = body.imageBase64 || match?.[2];
  if (!base64) throw new Error("Upload requires imageBase64 or imageDataUrl");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType, extension: extensionFor(contentType, body.extension) };
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assetFromRow(row: AssetRow, request: Request) {
  const metadata = JSON.parse(row.metadata_json || "{}");
  const origin = new URL(request.url).origin;
  const remoteImageUrl = `${origin}/api/assets/${encodeURIComponent(row.id)}/image`;
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    model: row.model,
    width: row.width,
    height: row.height,
    seed: row.seed,
    provider: row.provider,
    createdAt: row.created_at,
    timestamp: Date.parse(row.created_at),
    sampleUrl: row.sample_url,
    imageUrl: remoteImageUrl,
    payload: metadata.payload || {},
    runSettings: metadata.runSettings,
    costCredits: row.cost_credits,
    inputMp: row.input_mp,
    outputMp: row.output_mp,
    creditsBefore: row.credits_before,
    creditsAfter: row.credits_after,
    creditDelta: row.credit_delta,
    remoteImageKey: row.r2_image_key,
    remotePromptKey: row.r2_prompt_key,
    remoteMetadataKey: row.r2_metadata_key,
    remoteImageUrl,
    r2RootPrefix: R2_ROOT_PREFIX,
    updatedAt: row.updated_at
  };
}

async function uploadAsset(request: Request, env: Env) {
  await ensureSchema(env);
  const body = (await request.json()) as UploadBody;
  const metadata = body.metadata || {};
  const payload = metadata.payload || {};
  const submit = metadata.submit || {};
  const runSettings = metadata.runSettings || {};
  const id = body.id || metadata.id || crypto.randomUUID();
  const title = body.title || runSettings.title || "bfl-generation";
  const prompt = body.prompt || payload.prompt || "";
  if (!prompt) return json(request, env, { error: "Upload requires prompt text" }, 400);

  const image = decodeImage(body);
  const now = new Date().toISOString();
  const createdAt = runSettings.createdAt || metadata.createdAt || now;
  const date = createdAt.slice(0, 10);
  const fileBaseName = cleanSegment(body.fileBaseName || `${date}_${title}_${id}`) || id;
  const imageKey = `${R2_OUTPUTS_PREFIX}/${date}/${fileBaseName}.${image.extension}`;
  const promptKey = `${R2_OUTPUTS_PREFIX}/${date}/${fileBaseName}.prompt.txt`;
  const metadataKey = `${R2_OUTPUTS_PREFIX}/${date}/${fileBaseName}.json`;
  const metadataJson = JSON.stringify({
    ...metadata,
    remoteArchive: {
      imageKey,
      promptKey,
      metadataKey,
      rootPrefix: R2_ROOT_PREFIX,
      syncedAt: now
    }
  });

  await Promise.all([
    env.BFL_OUTPUTS.put(imageKey, image.bytes, {
      httpMetadata: { contentType: image.contentType },
      customMetadata: {
        id,
        title: title.slice(0, 120),
        model: String(metadata.model || payload.model || "").slice(0, 80)
      }
    }),
    env.BFL_OUTPUTS.put(promptKey, prompt, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    }),
    env.BFL_OUTPUTS.put(metadataKey, metadataJson, {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    })
  ]);

  await env.DB.prepare(
    `INSERT INTO assets (
      id, title, prompt, model, width, height, seed, provider, sample_url,
      r2_image_key, r2_prompt_key, r2_metadata_key,
      cost_credits, input_mp, output_mp, credits_before, credits_after, credit_delta,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      prompt = excluded.prompt,
      model = excluded.model,
      width = excluded.width,
      height = excluded.height,
      seed = excluded.seed,
      sample_url = excluded.sample_url,
      r2_image_key = excluded.r2_image_key,
      r2_prompt_key = excluded.r2_prompt_key,
      r2_metadata_key = excluded.r2_metadata_key,
      cost_credits = excluded.cost_credits,
      input_mp = excluded.input_mp,
      output_mp = excluded.output_mp,
      credits_before = excluded.credits_before,
      credits_after = excluded.credits_after,
      credit_delta = excluded.credit_delta,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`
  )
    .bind(
      id,
      title,
      prompt,
      metadata.model || payload.model || null,
      numberOrNull(payload.width),
      numberOrNull(payload.height),
      numberOrNull(payload.seed),
      "bfl-api",
      metadata.sampleUrl || null,
      imageKey,
      promptKey,
      metadataKey,
      numberOrNull(submit.cost ?? submit.creditDelta),
      numberOrNull(submit.inputMp),
      numberOrNull(submit.outputMp),
      numberOrNull(submit.creditsBefore),
      numberOrNull(submit.creditsAfter),
      numberOrNull(submit.creditDelta),
      metadataJson,
      createdAt,
      now
    )
    .run();

  const row = await getAssetRow(env, id);
  return json(request, env, {
    ok: true,
    asset: row ? assetFromRow(row, request) : { id, title },
    outputFiles: {
      r2ImageKey: imageKey,
      r2PromptKey: promptKey,
      r2MetadataKey: metadataKey,
      r2RootPrefix: R2_ROOT_PREFIX,
      remoteImageUrl: `${new URL(request.url).origin}/api/assets/${encodeURIComponent(id)}/image`
    }
  });
}

async function listAssets(request: Request, env: Env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 100));
  const result = await env.DB.prepare("SELECT * FROM assets ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .run<AssetRow>();

  return json(request, env, {
    ok: true,
    count: result.results.length,
    assets: result.results.map((row) => assetFromRow(row, request))
  });
}

async function getAssetRow(env: Env, id: string) {
  await ensureSchema(env);
  return env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first<AssetRow>();
}

async function getAssetMetadata(request: Request, env: Env, id: string) {
  const row = await getAssetRow(env, id);
  if (!row) return json(request, env, { error: "Asset not found" }, 404);
  return json(request, env, { ok: true, asset: assetFromRow(row, request), metadata: JSON.parse(row.metadata_json) });
}

async function getR2Object(request: Request, env: Env, id: string, kind: "image" | "prompt" | "metadata") {
  const row = await getAssetRow(env, id);
  if (!row) return json(request, env, { error: "Asset not found" }, 404);

  const key =
    kind === "image" ? row.r2_image_key : kind === "prompt" ? row.r2_prompt_key : row.r2_metadata_key;
  const object = await env.BFL_OUTPUTS.get(key);
  if (!object) return json(request, env, { error: "R2 object not found", key }, 404);

  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

async function deleteAsset(request: Request, env: Env, id: string) {
  const row = await getAssetRow(env, id);
  if (!row) return json(request, env, { error: "Asset not found" }, 404);

  await Promise.all([
    env.BFL_OUTPUTS.delete(row.r2_image_key),
    env.BFL_OUTPUTS.delete(row.r2_prompt_key),
    env.BFL_OUTPUTS.delete(row.r2_metadata_key),
    env.DB.prepare("DELETE FROM assets WHERE id = ?").bind(id).run()
  ]);

  return json(request, env, { ok: true, id });
}

function referenceFromRow(row: ReferenceRow, request: Request) {
  const metadata = JSON.parse(row.metadata_json || "{}");
  const origin = new URL(request.url).origin;
  const imageUrl = `${origin}/api/references/${encodeURIComponent(row.id)}/image`;
  return {
    id: row.id,
    setId: row.set_id,
    setName: row.set_name,
    title: row.title,
    fileName: row.file_name,
    prompt: row.prompt || "",
    caption: row.caption || "",
    mimeType: row.mime_type,
    createdAt: row.created_at,
    timestamp: Date.parse(row.created_at),
    imageUrl,
    remoteImageKey: row.r2_image_key,
    remoteMetadataKey: row.r2_metadata_key,
    r2RootPrefix: R2_ROOT_PREFIX,
    metadata,
    updatedAt: row.updated_at
  };
}

async function uploadReference(request: Request, env: Env) {
  await ensureSchema(env);
  const body = (await request.json()) as ReferenceUploadBody;
  const image = decodeImage(body);
  const now = new Date().toISOString();
  const id = body.id || crypto.randomUUID();
  const setId = cleanSegment(body.setId || "reference-set") || "reference-set";
  const title = body.title || body.fileName || "reference-image";
  const fileName = body.fileName || `${baseNameWithoutExtension(title)}.${image.extension}`;
  const fileBaseName = baseNameWithoutExtension(fileName || title || id);
  const imageKey = `${R2_REFERENCES_PREFIX}/${setId}/images/${fileBaseName}.${image.extension}`;
  const metadataKey = `${R2_REFERENCES_PREFIX}/${setId}/metadata/${fileBaseName}.json`;
  const metadataJson = JSON.stringify({
    ...(body.metadata || {}),
    remoteArchive: {
      imageKey,
      metadataKey,
      rootPrefix: R2_ROOT_PREFIX,
      syncedAt: now
    }
  });

  await Promise.all([
    env.BFL_OUTPUTS.put(imageKey, image.bytes, {
      httpMetadata: { contentType: image.contentType },
      customMetadata: {
        id,
        setId,
        title: title.slice(0, 120)
      }
    }),
    env.BFL_OUTPUTS.put(metadataKey, metadataJson, {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    })
  ]);

  await env.DB.prepare(
    `INSERT INTO reference_items (
      id, set_id, set_name, title, file_name, prompt, caption, mime_type,
      r2_image_key, r2_metadata_key, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      set_id = excluded.set_id,
      set_name = excluded.set_name,
      title = excluded.title,
      file_name = excluded.file_name,
      prompt = excluded.prompt,
      caption = excluded.caption,
      mime_type = excluded.mime_type,
      r2_image_key = excluded.r2_image_key,
      r2_metadata_key = excluded.r2_metadata_key,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`
  )
    .bind(
      id,
      setId,
      body.setName || null,
      title,
      fileName,
      body.prompt || null,
      body.caption || null,
      image.contentType,
      imageKey,
      metadataKey,
      metadataJson,
      now,
      now
    )
    .run();

  const row = await getReferenceRow(env, id);
  return json(request, env, {
    ok: true,
    reference: row ? referenceFromRow(row, request) : { id, setId, title, fileName }
  });
}

async function listReferences(request: Request, env: Env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || 500));
  const setId = url.searchParams.get("setId");
  const result = setId
    ? await env.DB.prepare("SELECT * FROM reference_items WHERE set_id = ? ORDER BY created_at DESC LIMIT ?")
        .bind(cleanSegment(setId), limit)
        .run<ReferenceRow>()
    : await env.DB.prepare("SELECT * FROM reference_items ORDER BY created_at DESC LIMIT ?")
        .bind(limit)
        .run<ReferenceRow>();

  return json(request, env, {
    ok: true,
    count: result.results.length,
    references: result.results.map((row) => referenceFromRow(row, request))
  });
}

async function getReferenceRow(env: Env, id: string) {
  await ensureSchema(env);
  return env.DB.prepare("SELECT * FROM reference_items WHERE id = ?").bind(id).first<ReferenceRow>();
}

async function getReferenceMetadata(request: Request, env: Env, id: string) {
  const row = await getReferenceRow(env, id);
  if (!row) return json(request, env, { error: "Reference not found" }, 404);
  return json(request, env, { ok: true, reference: referenceFromRow(row, request), metadata: JSON.parse(row.metadata_json) });
}

async function getReferenceImage(request: Request, env: Env, id: string) {
  const row = await getReferenceRow(env, id);
  if (!row) return json(request, env, { error: "Reference not found" }, 404);

  const object = await env.BFL_OUTPUTS.get(row.r2_image_key);
  if (!object) return json(request, env, { error: "R2 object not found", key: row.r2_image_key }, 404);

  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

async function deleteReference(request: Request, env: Env, id: string) {
  const row = await getReferenceRow(env, id);
  if (!row) return json(request, env, { error: "Reference not found" }, 404);

  await Promise.all([
    env.BFL_OUTPUTS.delete(row.r2_image_key),
    env.BFL_OUTPUTS.delete(row.r2_metadata_key),
    env.DB.prepare("DELETE FROM reference_items WHERE id = ?").bind(id).run()
  ]);

  return json(request, env, { ok: true, id });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json(request, env, { ok: true, service: "bfl-api-assets" });
    }

    const auth = authError(request, env);
    if (auth) return auth;

    if (url.pathname === "/api/assets" && request.method === "POST") return uploadAsset(request, env);
    if (url.pathname === "/api/assets" && request.method === "GET") return listAssets(request, env);
    if (url.pathname === "/api/references" && request.method === "POST") return uploadReference(request, env);
    if (url.pathname === "/api/references" && request.method === "GET") return listReferences(request, env);

    const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)(?:\/(image|prompt|metadata))?$/);
    if (assetMatch) {
      const id = decodeURIComponent(assetMatch[1]);
      const kind = assetMatch[2] as "image" | "prompt" | "metadata" | undefined;
      if (request.method === "GET" && kind) return getR2Object(request, env, id, kind);
      if (request.method === "GET") return getAssetMetadata(request, env, id);
      if (request.method === "DELETE") return deleteAsset(request, env, id);
    }

    const referenceMatch = url.pathname.match(/^\/api\/references\/([^/]+)(?:\/(image|metadata))?$/);
    if (referenceMatch) {
      const id = decodeURIComponent(referenceMatch[1]);
      const kind = referenceMatch[2] as "image" | "metadata" | undefined;
      if (request.method === "GET" && kind === "image") return getReferenceImage(request, env, id);
      if (request.method === "GET") return getReferenceMetadata(request, env, id);
      if (request.method === "DELETE") return deleteReference(request, env, id);
    }

    return json(request, env, { error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;
