#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDashboard, noAnswerMessage, stillRunningMessage } from "../lib/dashboard-answers.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

const positional = (positionals, label) => {
  if (!positionals[0]) throw new Error(`${label} is required.`);
  return positionals[0];
};
const numberFlag = (value) => (value === undefined || value === true ? undefined : Number(value));
const onlyDefined = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
/** Routes that take `{ record }`: a payload file may hold the record itself or the wrapped body. */
const asRecord = (payload) => (payload.record && typeof payload.record === "object" ? payload : { record: payload });

/**
 * One row per command. `tool` names the local MCP tool the command mirrors, so
 * the two agent surfaces can be checked against each other
 * (tests/cli-coverage.test.ts): every MCP tool has a command on the same route.
 * `payload` says whether the body comes from --json; `build` turns flags and
 * positionals into the query and body.
 */
export const COMMANDS = {
  manifest: { tool: "get_manifest", method: "GET", path: "/api/mcp/manifest", usage: "manifest" },
  context: { tool: "get_dashboard_context", method: "GET", path: "/api/dashboard/context", usage: "context" },
  "key-status": { tool: "get_api_key_status", method: "GET", path: "/api/bfl/key", usage: "key-status" },
  credits: {
    tool: "check_credits",
    method: "POST",
    path: "/api/bfl/credits",
    payload: "optional",
    usage: "credits [--json request.json]",
    build: ({ payload }) => ({ body: payload ?? {} })
  },
  assets: {
    tool: "list_assets",
    method: "GET",
    path: "/api/outputs",
    usage: "assets [--limit 40] [--offset 0] [--include-data]",
    build: ({ flags }) => ({ query: { limit: flags.limit, offset: flags.offset, includeData: flags["include-data"] } })
  },
  prompts: { tool: "list_prompts", method: "GET", path: "/api/prompts", usage: "prompts" },
  "save-prompt": {
    tool: "save_prompt",
    method: "POST",
    path: "/api/prompts",
    payload: "required",
    usage: "save-prompt --json record.json",
    build: ({ payload }) => ({ body: asRecord(payload) })
  },
  "delete-prompt": {
    tool: "delete_prompt",
    method: "DELETE",
    path: "/api/prompts",
    usage: "delete-prompt ID",
    build: ({ positionals }) => ({ query: { id: positional(positionals, "A prompt ID") } })
  },
  plan: { tool: "build_run_plan", method: "POST", path: "/api/dashboard/run-plan", payload: "required", usage: "plan --json request.json" },
  "plan-video-script": {
    tool: "plan_video_script",
    method: "POST",
    path: "/api/dashboard/video-script-plan",
    payload: "required",
    usage: "plan-video-script --json request.json"
  },
  batch: { tool: "run_batch", method: "POST", path: "/api/dashboard/batch", payload: "required", usage: "batch --json request.json" },
  queue: {
    tool: "list_generation_queue",
    method: "GET",
    path: "/api/dashboard/queue",
    usage: "queue [ID]",
    build: ({ flags, positionals }) => ({ query: { id: positionals[0] ?? flags.id } })
  },
  enqueue: {
    tool: "enqueue_generation_jobs",
    method: "POST",
    path: "/api/dashboard/queue",
    payload: "required",
    usage: "enqueue --json jobs.json"
  },
  "queue-update": {
    tool: "update_generation_job",
    method: "PATCH",
    path: "/api/dashboard/queue",
    usage:
      "queue-update pause|resume|retry|cancel|priority|settings|clear-settled [ID] [--priority N] [--reason TEXT]\n" +
      "                             [--global-limit N] [--image-limit N] [--tool-limit N] [--video-limit N]",
    build: ({ flags, positionals }) => {
      const laneLimits = onlyDefined({
        image: numberFlag(flags["image-limit"]),
        tool: numberFlag(flags["tool-limit"]),
        video: numberFlag(flags["video-limit"])
      });
      return {
        body: onlyDefined({
          action: positional(positionals, "A queue action"),
          id: positionals[1] ?? (typeof flags.id === "string" ? flags.id : undefined),
          priority: numberFlag(flags.priority),
          reason: typeof flags.reason === "string" ? flags.reason : undefined,
          globalLimit: numberFlag(flags["global-limit"]),
          laneLimits: Object.keys(laneLimits).length ? laneLimits : undefined
        })
      };
    }
  },
  "queue-cancel": {
    tool: "cancel_generation_job",
    method: "DELETE",
    path: "/api/dashboard/queue",
    usage: "queue-cancel ID [--remove] | queue-cancel --settled",
    build: ({ flags, positionals }) => {
      if (!positionals[0] && !flags.settled) throw new Error("queue-cancel requires a queue job ID, or --settled.");
      return { query: { id: positionals[0], remove: flags.remove ? "true" : undefined, settled: flags.settled ? "true" : undefined } };
    }
  },
  "generate-image": {
    tool: "generate_saved_image",
    method: "POST",
    path: "/api/bfl/generate",
    payload: "required",
    usage: "generate-image --json request.json"
  },
  "generate-with-finetune": {
    tool: "generate_with_finetune",
    method: "POST",
    path: "/api/bfl/generate",
    payload: "required",
    usage: "generate-with-finetune --json request.json"
  },
  "generate-flux3-image": {
    tool: "generate_flux3_image",
    method: "POST",
    path: "/api/bfl/flux3-image",
    payload: "required",
    usage: "generate-flux3-image --json request.json"
  },
  "generate-video": {
    tool: "generate_flux3_video",
    method: "POST",
    path: "/api/bfl/flux3-video",
    payload: "required",
    usage: "generate-video --json request.json"
  },
  "upscale-video": { tool: "upscale_video", method: "POST", path: "/api/bfl/video-upscale", payload: "required", usage: "upscale-video --json request.json" },
  "edit-video": { tool: "edit_video", method: "POST", path: "/api/bfl/video-edit", payload: "required", usage: "edit-video --json request.json" },
  "trim-video": { tool: "trim_video", method: "POST", path: "/api/bfl/video-trim", payload: "required", usage: "trim-video --json request.json" },
  "run-tool": { tool: "run_image_tool", method: "POST", path: "/api/bfl/tools", payload: "required", usage: "run-tool --json request.json" },
  videos: { tool: "list_flux3_videos", method: "GET", path: "/api/bfl/flux3-video", usage: "videos" },
  "video-upscales": { tool: "list_video_upscales", method: "GET", path: "/api/bfl/video-upscale", usage: "video-upscales" },
  "video-edits": { tool: "list_video_edits", method: "GET", path: "/api/bfl/video-edit", usage: "video-edits" },
  "video-trims": { tool: "list_video_trims", method: "GET", path: "/api/bfl/video-trim", usage: "video-trims" },
  evaluations: {
    tool: "list_evaluations",
    method: "GET",
    path: "/api/evaluations",
    usage:
      "evaluations [--id ID] [--media image|video] [--model NAME] [--verdict VALUE]\n" +
      "                            [--search TEXT] [--limit 200] [--format json|jsonl]",
    build: ({ flags }) => ({
      query: {
        id: flags.id,
        mediaType: flags.media,
        model: flags.model,
        verdict: flags.verdict,
        search: flags.search,
        limit: flags.limit,
        format: flags.format
      }
    })
  },
  evaluate: {
    tool: "update_evaluation",
    method: "PATCH",
    path: "/api/evaluations",
    usage: "evaluate ID [--rating 1..5] [--verdict keep|maybe|reject|unreviewed]\n                         [--tags tag-a,tag-b] [--notes TEXT]",
    build: ({ flags, positionals }) => ({
      query: { id: positional(positionals, "evaluate: a generation ID") },
      body: onlyDefined({
        rating: numberFlag(flags.rating),
        verdict: flags.verdict,
        tags: typeof flags.tags === "string" ? flags.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
        notes: flags.notes
      })
    })
  },
  collections: {
    tool: "list_collections",
    method: "GET",
    path: "/api/collections",
    usage: "collections [ID]",
    build: ({ flags, positionals }) => ({ query: { id: positionals[0] ?? flags.id } })
  },
  "create-collection": {
    tool: "create_collection",
    method: "POST",
    path: "/api/collections",
    payload: "required",
    usage: "create-collection --json collection.json"
  },
  "update-collection": {
    tool: "update_collection",
    method: "PATCH",
    path: "/api/collections",
    payload: "required",
    usage: "update-collection ID --json changes.json",
    build: ({ positionals, payload }) => ({ query: { id: positional(positionals, "A collection ID") }, body: payload })
  },
  "delete-collection": {
    tool: "delete_collection",
    method: "DELETE",
    path: "/api/collections",
    usage: "delete-collection ID [--asset-id ASSET]",
    build: ({ flags, positionals }) => ({ query: { id: positional(positionals, "A collection ID"), assetId: flags["asset-id"] } })
  },
  "reference-archive": {
    tool: "list_reference_archive",
    method: "GET",
    path: "/api/reference-archive",
    usage: "reference-archive [--limit 500] [--set-id ID]",
    build: ({ flags }) => ({ query: { limit: flags.limit, setId: flags["set-id"] } })
  },
  "sync-reference-archive": {
    tool: "sync_reference_archive",
    method: "POST",
    path: "/api/reference-archive",
    payload: "required",
    usage: "sync-reference-archive --json request.json"
  },
  "vectorize-glyph": {
    tool: "vectorize_glyph",
    method: "POST",
    path: "/api/glyphs/vectorize",
    payload: "required",
    usage: "vectorize-glyph --json request.json"
  },
  "vectorize-glyph-batch": {
    tool: "vectorize_glyph_batch",
    method: "POST",
    path: "/api/glyphs/vectorize",
    payload: "required",
    usage: "vectorize-glyph-batch --json request.json",
    // One request per source and colour count, as the MCP tool sends them.
    batch: ({ sourceAssetIds, colors = [2, 4], ...shared }) => {
      if (!Array.isArray(sourceAssetIds) || !sourceAssetIds.length) throw new Error("vectorize-glyph-batch needs sourceAssetIds.");
      return sourceAssetIds.flatMap((sourceAssetId) =>
        colors.map((colorCount) => ({
          ...shared,
          sourceAssetId,
          colors: colorCount,
          title: `glyph-${colorCount}c-${String(sourceAssetId).slice(0, 12)}`
        }))
      );
    }
  },
  "caption-job": {
    tool: "prepare_caption_job",
    method: "POST",
    path: "/api/bfl_dashboard/v1/caption_agent",
    payload: "required",
    usage: "caption-job --json request.json"
  },
  "finetune-dataset": {
    tool: "build_finetune_dataset",
    method: "POST",
    path: "/api/finetune/dataset",
    payload: "required",
    usage: "finetune-dataset --json request.json"
  },
  finetunes: { tool: "list_finetunes", method: "GET", path: "/api/finetunes", usage: "finetunes" },
  "register-finetune": {
    tool: "register_finetune",
    method: "POST",
    path: "/api/finetunes",
    payload: "required",
    usage: "register-finetune --json record.json",
    build: ({ payload }) => ({ body: asRecord(payload) })
  }
};

export const HELP = `BFL Dashboard CLI — thin client for the local UI/MCP API

Usage:
${Object.values(COMMANDS)
  .map((command) => `  npm run --silent cli -- ${command.usage}`)
  .join("\n")}

Every local MCP tool has a command here on the same route. Use --json - to read
a payload from stdin. Set BFL_DASHBOARD_URL or pass --base-url
http://127.0.0.1:3000. All output is machine-readable JSON; the evaluations
command can emit JSONL for agent pipelines.`;

/**
 * @param {string[]} argv
 * @returns {{ command: string, flags: Record<string, string | boolean>, positionals: string[] }}
 */
export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  /** @type {string[]} */
  const positionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const equalAt = value.indexOf("=");
    const key = value.slice(2, equalAt > 0 ? equalAt : undefined);
    if (equalAt > 0) {
      flags[key] = value.slice(equalAt + 1);
    } else if (rest[index + 1] && !rest[index + 1].startsWith("--")) {
      flags[key] = rest[index + 1];
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags, positionals };
}

function queryPath(path, values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The HTTP requests a command makes: one, or one per item for a batch command.
 * @param {string} name
 * @param {{ flags?: Record<string, string | boolean>, positionals?: string[], payload?: Record<string, any> }} [input]
 * @returns {Array<{ method: string, path: string, body?: any }>}
 */
export function buildRequests(name, { flags = {}, positionals = [], payload } = {}) {
  const config = COMMANDS[name];
  if (!config) throw new Error(`Unknown command: ${name}`);
  if (config.batch) {
    return config.batch(payload ?? {}).map((body) => ({ method: config.method, path: config.path, body }));
  }
  const built = config.build ? config.build({ flags, positionals, payload }) : {};
  const body = built.body ?? (config.payload ? payload : undefined);
  return [{ method: config.method, path: queryPath(config.path, built.query ?? {}), body }];
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function payloadFrom(flags, need) {
  const source = flags.json;
  if (!source || typeof source !== "string") {
    if (need === "required") throw new Error("This command requires --json FILE or --json -.");
    return undefined;
  }
  const text = source === "-" ? await readStdin() : await readFile(source, "utf8");
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("The JSON payload must be an object.");
  return payload;
}

/** The command that shows a queue job, or the whole queue. */
const followInQueue = (id) => `npm run --silent cli -- queue${id ? ` ${id}` : ""}`;

/** Pause before sending a paid request again; tests shorten it. */
const RETRY_DELAY_MS = Number(process.env.BFL_DASHBOARD_RETRY_DELAY_MS) >= 0 ? Number(process.env.BFL_DASHBOARD_RETRY_DELAY_MS) : 1500;

async function send(baseUrl, { method, path, body }) {
  const response = await fetchDashboard(
    `${baseUrl}${path}`,
    {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    },
    { method, path, delayMs: RETRY_DELAY_MS }
  ).catch((error) => {
    throw new Error(noAnswerMessage(error, { method, path, baseUrl, follow: followInQueue }));
  });
  const text = await response.text();
  if (!response.ok) {
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON: reported as it came.
    }
    throw new Error(stillRunningMessage(data, { method, path, follow: followInQueue }) || `${method} ${path} failed (${response.status}): ${text}`);
  }
  return text;
}

async function main() {
  const { command, flags, positionals } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const config = COMMANDS[command];
  if (!config) throw new Error(`Unknown command: ${command}\n\n${HELP}`);

  const baseUrl = String(flags["base-url"] || process.env.BFL_DASHBOARD_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const payload = config.payload ? await payloadFrom(flags, config.payload) : undefined;
  const requests = buildRequests(command, { flags, positionals, payload });

  if (!config.batch) {
    const text = await send(baseUrl, requests[0]);
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    return;
  }
  const outputs = [];
  for (const request of requests) outputs.push(JSON.parse(await send(baseUrl, request)));
  process.stdout.write(`${JSON.stringify({ count: outputs.length, outputs }, null, 2)}\n`);
}

/** True when run as a script; tests import the command table without sending anything. */
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
