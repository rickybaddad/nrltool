"use client";

import { useState } from "react";

type Job = {
  key: string;
  label: string;
  path: string;
  description: string;
  body?: Record<string, unknown>;
  streaming?: boolean;
};

const currentSeason = new Date().getUTCFullYear();

const manualJobs: Job[] = [
  {
    key: "sync-season",
    label: "Sync current season",
    path: "/api/jobs/sync-season/stream",
    body: { season: currentSeason },
    description:
      "Imports the full schedule, refreshes results, updates odds, generates upcoming predictions, and evaluates completed matches.",
    streaming: true,
  },
  {
    key: "import-season-schedule",
    label: "Import season schedule",
    path: "/api/jobs/import-season-schedule",
    body: { season: currentSeason },
    description: "Fetches and upserts the full fixture list for the selected season.",
  },
  {
    key: "refresh-results",
    label: "Refresh results",
    path: "/api/jobs/refresh-results",
    body: { season: currentSeason },
    description: "Updates completed match scores and statuses for the season.",
  },
  {
    key: "generate-round-predictions",
    label: "Generate upcoming predictions",
    path: "/api/jobs/generate-predictions",
    body: { season: currentSeason, upcomingOnly: true },
    description:
      "Creates pre-match prediction snapshots for upcoming matches that do not yet have a valid pre-kickoff prediction.",
  },
  {
    key: "evaluate-predictions",
    label: "Evaluate predictions",
    path: "/api/jobs/evaluate-predictions",
    body: { season: currentSeason },
    description:
      "Grades completed matches against the final pre-match prediction generated before kickoff.",
  },
];

type StepLine = {
  step: string;
  status: "running" | "done" | "skipped" | "error";
  detail?: string;
};

const STATUS_ICON: Record<StepLine["status"], string> = {
  running: "⏳",
  done: "✓",
  skipped: "⚠",
  error: "✗",
};

const STATUS_CLASS: Record<StepLine["status"], string> = {
  running: "text-slate-300",
  done: "text-emerald-400",
  skipped: "text-amber-400",
  error: "text-rose-400",
};

function SyncProgress({
  lines,
  finalStatus,
}: {
  lines: StepLine[];
  finalStatus: string | null;
}) {
  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs">
      {lines.length === 0 && !finalStatus && (
        <div className="text-slate-500">Connecting…</div>
      )}
      {lines.map((line, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 py-0.5 ${STATUS_CLASS[line.status]}`}
        >
          <span className="w-4 shrink-0">{STATUS_ICON[line.status]}</span>
          <span>
            {line.step}
            {line.detail && (
              <span className="ml-2 text-slate-400">— {line.detail}</span>
            )}
          </span>
        </div>
      ))}
      {finalStatus && (
        <div
          className={`mt-2 border-t border-slate-700 pt-2 font-semibold ${
            finalStatus.startsWith("Failed") ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {finalStatus}
        </div>
      )}
    </div>
  );
}

export function ManualJobControls() {
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("No job triggered yet.");
  const [syncLines, setSyncLines] = useState<StepLine[]>([]);
  const [syncFinal, setSyncFinal] = useState<string | null>(null);

  async function triggerStreaming(job: Job) {
    setRunningKey(job.key);
    setSyncLines([]);
    setSyncFinal(null);
    setStatus("");

    const season = (job.body?.season as number) ?? currentSeason;
    const url = `${job.path}?season=${season}`;

    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            if (event.status === "complete") {
              setSyncFinal("Sync completed successfully.");
            } else if (event.status === "failed") {
              setSyncFinal(`Failed: ${event.error}`);
            } else if (event.step) {
              setSyncLines((prev) => {
                const entry: StepLine = {
                  step: event.step,
                  status: event.status,
                  detail: event.detail ?? event.reason ?? event.error,
                };
                const idx = prev.findIndex((l) => l.step === event.step);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = entry;
                  return next;
                }
                return [...prev, entry];
              });
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setSyncFinal(`Failed: ${msg}`);
    } finally {
      setRunningKey(null);
    }
  }

  async function triggerJob(job: Job) {
    setRunningKey(job.key);
    setSyncLines([]);
    setSyncFinal(null);
    setStatus(`Running ${job.label.toLowerCase()}...`);

    try {
      const res = await fetch(job.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job.body ?? {}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const apiError =
          payload && typeof payload.error === "string"
            ? payload.error
            : `${res.status} ${res.statusText}`;
        throw new Error(apiError);
      }
      setStatus(`${job.label} completed successfully.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`${job.label} failed: ${message}`);
    } finally {
      setRunningKey(null);
    }
  }

  const activeJobIsStreaming = manualJobs.find((j) => j.key === runningKey)?.streaming;

  return (
    <section className="mt-8 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">Manual job controls</h2>
      <p className="mt-2 text-sm text-slate-300">
        Trigger idempotent serverless jobs manually. These are season-aware and safe to rerun.
      </p>

      <div className="mt-4 space-y-3">
        {manualJobs.map((job) => (
          <div key={job.key} className="rounded border border-slate-800 p-3">
            <div className="mb-2 text-sm text-slate-300">{job.description}</div>
            <button
              type="button"
              onClick={() =>
                job.streaming ? triggerStreaming(job) : triggerJob(job)
              }
              disabled={runningKey !== null}
              className="rounded bg-slate-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningKey === job.key ? "Running..." : job.label}
            </button>

            {job.key === "sync-season" &&
              (syncLines.length > 0 || syncFinal !== null || runningKey === "sync-season") && (
                <SyncProgress lines={syncLines} finalStatus={syncFinal} />
              )}
          </div>
        ))}
      </div>

      {!activeJobIsStreaming && status && (
        <p className="mt-4 text-sm">Status: {status}</p>
      )}
    </section>
  );
}
