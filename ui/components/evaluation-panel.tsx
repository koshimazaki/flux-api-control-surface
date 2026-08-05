"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Save } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";
import { downloadText } from "@/lib/prompt-utils";
import type { EvaluationVerdict, GenerationEvaluationRecord } from "@/lib/generation-evaluation";

type EvaluationResponse = {
  records?: GenerationEvaluationRecord[];
  error?: string;
};

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number") return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatCredits(record: GenerationEvaluationRecord) {
  const value = record.cost.chargedCredits ?? record.cost.submittedCredits;
  return typeof value === "number" ? `${value.toFixed(2)} cr` : "—";
}

export function EvaluationPanel() {
  const [records, setRecords] = useState<GenerationEvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState("all");
  const [model, setModel] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/evaluations?limit=500", { cache: "no-store" });
      const data = (await response.json()) as EvaluationResponse;
      if (!response.ok) throw new Error(data.error || "Could not load evaluation records.");
      setRecords(data.records || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load evaluation records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const models = useMemo(() => [...new Set(records.map((record) => record.model))].sort(), [records]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (mediaType !== "all" && record.mediaType !== mediaType) return false;
      if (model !== "all" && record.model !== model) return false;
      if (verdict !== "all" && record.annotation.verdict !== verdict) return false;
      return !query || `${record.title} ${record.prompt.text} ${record.annotation.tags.join(" ")}`.toLowerCase().includes(query);
    });
  }, [mediaType, model, records, search, verdict]);
  const visibleRecords = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(24);
  }, [mediaType, model, search, verdict]);

  function updateAnnotation(id: string, patch: Partial<GenerationEvaluationRecord["annotation"]>) {
    setRecords((current) => current.map((record) => record.id === id
      ? { ...record, annotation: { ...record.annotation, ...patch } }
      : record));
  }

  async function save(record: GenerationEvaluationRecord) {
    setSavingId(record.id);
    setError("");
    try {
      const response = await fetch(`/api/evaluations?id=${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...record.annotation, rating: record.annotation.rating ?? null })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save evaluation.");
      setRecords((current) => current.map((item) => item.id === record.id ? data.record : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save evaluation.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="assetsPanel evaluationPanel">
      <PanelHeader title="Model Evaluation" subtitle={`${filtered.length} of ${records.length} captured generations`}>
        <div className="assetActions">
          <button onClick={() => downloadText("bfl-evaluations.json", JSON.stringify(filtered, null, 2))} disabled={!filtered.length}>
            <Download size={16} />
            JSON
          </button>
          <button onClick={() => downloadText("bfl-evaluations.jsonl", filtered.map((record) => JSON.stringify(record)).join("\n") + "\n")} disabled={!filtered.length}>
            <Download size={16} />
            JSONL
          </button>
          <button onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
            Refresh
          </button>
        </div>
      </PanelHeader>

      <div className="evaluationFilters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prompt, title, or tag" />
        <select value={mediaType} onChange={(event) => setMediaType(event.target.value)} aria-label="Media type">
          <option value="all">All media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model">
          <option value="all">All models</option>
          {models.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={verdict} onChange={(event) => setVerdict(event.target.value)} aria-label="Verdict">
          <option value="all">All verdicts</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="keep">Keep</option>
          <option value="maybe">Maybe</option>
          <option value="reject">Reject</option>
        </select>
      </div>

      {error && <div className="errorText">{error}</div>}
      <div className="evaluationGrid">
        {visibleRecords.map((record) => (
          <article className="evaluationCard" key={record.id}>
            <div className="evaluationMedia">
              {record.mediaType === "video" ? (
                <video src={record.output.previewUrl} controls preload="metadata" />
              ) : (
                // Saved output routes are local and stable; metadata is shown beside the preview.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.output.previewUrl} alt={record.title} loading="lazy" />
              )}
            </div>
            <div className="evaluationBody">
              <div className="evaluationTitle">
                <strong>{record.title}</strong>
                <small>{new Date(record.createdAt).toLocaleString()}</small>
              </div>
              <div className="evaluationMetrics">
                <span>{record.mediaType}</span>
                <span>{record.model}</span>
                <span>{formatDuration(record.timing?.durations.totalMs)}</span>
                <span>{formatCredits(record)}</span>
              </div>
              <p>{record.prompt.text || "No prompt captured."}</p>
              <div className="evaluationControls">
                <label>
                  Rating
                  <select
                    value={record.annotation.rating || ""}
                    onChange={(event) => updateAnnotation(record.id, { rating: event.target.value ? Number(event.target.value) : undefined })}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
                  </select>
                </label>
                <label>
                  Verdict
                  <select
                    value={record.annotation.verdict}
                    onChange={(event) => updateAnnotation(record.id, { verdict: event.target.value as EvaluationVerdict })}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="keep">Keep</option>
                    <option value="maybe">Maybe</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <label className="evaluationWideField">
                  Tags
                  <input
                    value={record.annotation.tags.join(", ")}
                    onChange={(event) => updateAnnotation(record.id, {
                      tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean)
                    })}
                    placeholder="motion, consistency, favorite"
                  />
                </label>
                <label className="evaluationWideField">
                  Notes
                  <textarea
                    value={record.annotation.notes}
                    onChange={(event) => updateAnnotation(record.id, { notes: event.target.value })}
                    placeholder="What worked, what failed, what to try next"
                    rows={2}
                  />
                </label>
              </div>
              <button className="evaluationSave" onClick={() => void save(record)} disabled={savingId === record.id}>
                <Save size={15} />
                {savingId === record.id ? "Saving…" : "Save evaluation"}
              </button>
            </div>
          </article>
        ))}
        {!loading && !filtered.length && <div className="runLogEmpty">No captured generations match these filters.</div>}
      </div>
      {visibleCount < filtered.length && (
        <button className="evaluationLoadMore" onClick={() => setVisibleCount((count) => count + 24)}>
          Show 24 more · {filtered.length - visibleCount} remaining
        </button>
      )}
    </section>
  );
}
