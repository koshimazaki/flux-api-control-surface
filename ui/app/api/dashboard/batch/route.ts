import { NextRequest, NextResponse } from "next/server";
import { BFL_MAX_REFERENCES } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchBody = {
  execute?: boolean;
  apiKey?: string;
  references?: string[];
  continueOnError?: boolean;
  [key: string]: unknown;
};

function redactApiKey<T extends Record<string, unknown>>(body: T) {
  const { apiKey: _apiKey, ...safeBody } = body;
  return safeBody;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function POST(request: NextRequest) {
  let body: BatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const planResponse = await fetch(`${origin}/api/dashboard/run-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(redactApiKey(body)),
    cache: "no-store"
  });
  const plan = await readJson(planResponse);
  if (!planResponse.ok) {
    return NextResponse.json({ error: "Could not build batch plan", details: plan }, { status: planResponse.status });
  }

  const nativeMcpHandoff = {
    ...plan.nativeFluxMcpHandoff,
    note:
      "The control-surface executor uses the same planned request bodies exposed here. Use local execution when you want output files and gallery recovery."
  };

  if (!body.execute) {
    return NextResponse.json({
      mode: "dry-run",
      plan,
      nativeMcpHandoff
    });
  }

  const references = Array.isArray(body.references)
    ? body.references.filter(Boolean).slice(0, BFL_MAX_REFERENCES)
    : [];
  const continueOnError = body.continueOnError !== false;
  const results = [];

  for (const item of plan.requests || []) {
    const started = Date.now();
    const generateResponse = await fetch(`${origin}${item.endpoint}`, {
      method: item.method || "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item.body,
        apiKey: body.apiKey,
        references
      }),
      cache: "no-store"
    });
    const data = await readJson(generateResponse);
    const result = {
      title: item.title,
      batchIndex: item.batchIndex,
      batchTotal: item.batchTotal,
      ok: generateResponse.ok,
      status: generateResponse.status,
      durationMs: Date.now() - started,
      id: data.id,
      sampleUrl: data.sampleUrl,
      outputFiles: data.outputFiles,
      submit: data.submit,
      error: data.error,
      details: data.details
    };
    results.push(result);
    if (!generateResponse.ok && !continueOnError) break;
  }

  const completed = results.filter((item) => item.ok).length;
  return NextResponse.json({
    mode: "execute",
    requested: plan.count,
    completed,
    failed: results.length - completed,
    estimatedCredits: plan.estimatedCredits,
    results,
    outputsRoute: "/api/outputs"
  });
}
