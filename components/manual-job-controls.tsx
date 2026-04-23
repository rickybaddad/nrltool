"use client";

import { useState } from "react";

type Job = {
  key: string;
  label: string;
  path: string;
  description: string;
  body?: Record<string, unknown>;
};

const currentSeason = new Date().getUTCFullYear();

const manualJobs: Job[] = [
  {
    key: "sync-season",
    label: "Sync current season",
    path: "/api/jobs/sync-season",
    body: { season: currentSeason },
    description: "Imports the full schedule, refreshes results, updates odds, generates upcoming predictions, and evaluates completed matches."
  },
  {
    key: "import-season-schedule",
    label: "Import season schedule",
    path: "/api/jobs/import-season-schedule",
    body: { season: currentSeason },
    description: "Fetches and upserts the full fixture list for the selected season."
  },
  {
    key: "refresh-results",
    label: "Refresh results",
    path: "/api/jobs/refresh-results",
    body: { season: currentSeason },
    description: "Updates completed match scores and statuses for the season."
  },
  {
    key: "generate-round-predictions",
    label: "Generate upcoming predictions",
    path: "/api/jobs/generate-predictions",
    body: { season: currentSeason, upcomingOnly: true },
    description: "Creates pre-match prediction snapshots for upcoming matches that do not yet have a valid pre-kickoff prediction."
  },
  {
    key: "evaluate-predictions",
    label: "Evaluate predictions",
    path: "/api/jobs/evaluate-predictions",
    body: { season: currentSeason },
    description: "Grades completed matches against the final pre-match prediction generated before kickoff."
  }
];

export function ManualJobControls() {
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("No job triggered yet.");

  async function triggerJob(job: Job) {
    setRunningKey(job.key);
    setStatus(`Running ${job.label.toLowerCase()}...`);

    try {
      const res = await fetch(job.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job.body ?? {})
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const apiError = payload && typeof payload.error === "string" ? payload.error : `${res.status} ${res.statusText}`;
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
              onClick={() => triggerJob(job)}
              disabled={runningKey !== null}
              className="rounded bg-slate-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningKey === job.key ? "Running..." : job.label}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm">Status: {status}</p>
    </section>
  );
}
