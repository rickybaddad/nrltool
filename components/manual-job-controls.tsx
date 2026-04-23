"use client";

import { useState } from "react";

type Job = {
  key: string;
  label: string;
  path: string;
  description: string;
};

const manualJobs: Job[] = [
  {
    key: "bootstrap",
    label: "Run bootstrap",
    path: "/api/jobs/bootstrap",
    description: "Runs the full pipeline: history import, ratings, fixtures, odds, and predictions."
  },
  {
    key: "import-odds",
    label: "Import odds",
    path: "/api/jobs/import-odds",
    description: "Fetches latest bookmaker prices for the current week and stores new snapshots."
  },
  {
    key: "generate-predictions",
    label: "Generate predictions",
    path: "/api/jobs/generate-predictions",
    description: "Creates fresh model predictions using the latest ratings and odds snapshots."
  }
];

export function ManualJobControls() {
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("No job triggered yet.");

  async function triggerJob(job: Job) {
    setRunningKey(job.key);
    setStatus(`Running ${job.label.toLowerCase()}...`);

    try {
      const res = await fetch(job.path, { method: "POST" });
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
        Cron schedules are disabled. Use these actions whenever you want to run the background jobs manually.
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
