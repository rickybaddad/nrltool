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
    key: "sync-results",
    label: "Sync results",
    path: "/api/jobs/sync-results",
    description:
      "Checks past incomplete matches and the current NRL week (Thu–Mon) for updated scores. Calls TheSportsDB once per date.",
  },
  {
    key: "import-odds",
    label: "Import odds",
    path: "/api/jobs/import-odds",
    body: { season: currentSeason },
    description: "Pulls the latest betting odds from The Odds API for upcoming matches.",
  },
  {
    key: "calculate-ratings",
    label: "Calculate Elo ratings",
    path: "/api/jobs/calculate-ratings",
    description: "Recalculates Elo ratings for all teams from every completed match in chronological order.",
  },
  {
    key: "generate-predictions",
    label: "Generate predictions",
    path: "/api/jobs/generate-predictions",
    body: { season: currentSeason },
    description:
      "Regenerates predictions for every match in the season using the blended Elo + score model. Processes rounds in chronological order — model never sees future results.",
  },
  {
    key: "evaluate-predictions",
    label: "Evaluate predictions",
    path: "/api/jobs/evaluate-predictions",
    body: { season: currentSeason },
    description: "Grades completed matches against the final pre-match prediction generated before kickoff.",
  },
];

type SyncResultsSummary = {
  datesChecked: string[];
  apiCallsMade: number;
  eventsReturned: number;
  matchesUpdated: number;
  resultsCompleted: number;
  unmatchedEvents: Array<{ date: string; homeTeam: string; awayTeam: string }>;
  stillMissingResults: Array<{ homeTeam: string; awayTeam: string; kickoffAt: string }>;
};

export function ManualJobControls() {
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<Record<string, string>>({});
  const [syncResultsSummary, setSyncResultsSummary] = useState<SyncResultsSummary | null>(null);

  async function triggerJob(job: Job) {
    setRunningKey(job.key);
    setSyncResultsSummary(null);
    setJobStatus((prev) => ({ ...prev, [job.key]: "Running..." }));

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
      if (job.key === "sync-results" && payload) {
        setSyncResultsSummary(payload as SyncResultsSummary);
        setJobStatus((prev) => ({ ...prev, [job.key]: "" }));
      } else {
        setJobStatus((prev) => ({ ...prev, [job.key]: "Completed successfully." }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setJobStatus((prev) => ({ ...prev, [job.key]: `Failed: ${message}` }));
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <section className="mt-8 rounded border border-slate-700 p-4">
      <h2 className="text-xl font-semibold">Manual job controls</h2>
      <p className="mt-2 text-sm text-slate-300">
        Run these in order after each round completes. All jobs are idempotent and safe to rerun.
      </p>

      <div className="mt-4 space-y-3">
        {manualJobs.map((job, i) => (
          <div key={job.key} className="rounded border border-slate-800 p-3">
            <div className="mb-2 flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium">{job.label}</div>
                <div className="mt-0.5 text-xs text-slate-400">{job.description}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => triggerJob(job)}
              disabled={runningKey !== null}
              className="rounded bg-slate-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningKey === job.key ? "Running..." : job.label}
            </button>

            {jobStatus[job.key] && (
              <p
                className={`mt-2 text-xs ${
                  jobStatus[job.key].startsWith("Failed") ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {jobStatus[job.key]}
              </p>
            )}

            {job.key === "sync-results" && syncResultsSummary && (
              <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs space-y-1">
                <div className="text-emerald-400 font-semibold mb-2">Sync results complete</div>
                <div><span className="text-slate-400">Dates checked:</span> {syncResultsSummary.datesChecked.join(", ") || "none"}</div>
                <div><span className="text-slate-400">API calls made:</span> {syncResultsSummary.apiCallsMade}</div>
                <div><span className="text-slate-400">Events returned:</span> {syncResultsSummary.eventsReturned}</div>
                <div><span className="text-slate-400">Matches updated:</span> {syncResultsSummary.matchesUpdated}</div>
                <div><span className="text-slate-400">Results completed:</span> {syncResultsSummary.resultsCompleted}</div>
                {syncResultsSummary.unmatchedEvents.length > 0 && (
                  <div className="text-amber-400 mt-1">
                    {syncResultsSummary.unmatchedEvents.length} unmatched event(s)
                  </div>
                )}
                {syncResultsSummary.stillMissingResults.length > 0 && (
                  <div className="text-amber-400">
                    {syncResultsSummary.stillMissingResults.length} match(es) still missing results
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
