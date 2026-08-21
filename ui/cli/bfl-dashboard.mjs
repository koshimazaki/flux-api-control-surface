#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

const COMMANDS = {
  context: { method: "GET", path: "/api/dashboard/context" },
  assets: { method: "GET", path: "/api/outputs" },
  evaluations: { method: "GET", path: "/api/evaluations" },
  evaluate: { method: "PATCH", path: "/api/evaluations" },
  plan: { method: "POST", path: "/api/dashboard/run-plan", payload: true },
  batch: { method: "POST", path: "/api/dashboard/batch", payload: true },
  "generate-image": { method: "POST", path: "/api/bfl/generate", payload: true },
  "generate-video": { method: "POST", path: "/api/bfl/flux3-video", payload: true },
  "upscale-video": { method: "POST", path: "/api/bfl/video-upscale", payload: true },
  "run-tool": { method: "POST", path: "/api/bfl/tools", payload: true }
};

const HELP = `BFL Dashboard CLI — thin client for the local UI/MCP API

Usage:
  npm run --silent cli -- context
  npm run --silent cli -- assets [--limit 40] [--offset 0]
  npm run --silent cli -- evaluations [--media image|video] [--model NAME] [--verdict VALUE]
                            [--search TEXT] [--limit 200] [--format json|jsonl]
  npm run --silent cli -- evaluate ID [--rating 1..5] [--verdict keep|maybe|reject|unreviewed]
                         [--tags tag-a,tag-b] [--notes TEXT]
  npm run --silent cli -- plan --json request.json
  npm run --silent cli -- batch --json request.json
  npm run --silent cli -- generate-image --json request.json
  npm run --silent cli -- generate-video --json request.json
  npm run --silent cli -- upscale-video --json request.json
  npm run --silent cli -- run-tool --json request.json

Use --json - to read a payload from stdin. Set BFL_DASHBOARD_URL or pass
--base-url http://127.0.0.1:3000. All output is machine-readable JSON; the
evaluations command can emit JSONL for agent pipelines.`;

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const flags = {};
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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function payloadFrom(flags) {
  const source = flags.json;
  if (!source || typeof source !== "string") throw new Error("This command requires --json FILE or --json -.");
  const text = source === "-" ? await readStdin() : await readFile(source, "utf8");
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("The JSON payload must be an object.");
  return payload;
}

function queryPath(path, values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
  let path = config.path;
  let body;

  if (command === "assets") {
    path = queryPath(path, { limit: flags.limit, offset: flags.offset, includeData: flags["include-data"] });
  } else if (command === "evaluations") {
    path = queryPath(path, {
      mediaType: flags.media,
      model: flags.model,
      verdict: flags.verdict,
      search: flags.search,
      limit: flags.limit,
      format: flags.format
    });
  } else if (command === "evaluate") {
    const id = positionals[0];
    if (!id) throw new Error("evaluate requires a generation ID.");
    path = queryPath(path, { id });
    body = {
      rating: flags.rating === undefined ? undefined : Number(flags.rating),
      verdict: flags.verdict,
      tags: typeof flags.tags === "string" ? flags.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
      notes: flags.notes
    };
    body = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
  } else if (config.payload) {
    body = await payloadFrom(flags);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: config.method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${config.method} ${path} failed (${response.status}): ${text}`);
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
