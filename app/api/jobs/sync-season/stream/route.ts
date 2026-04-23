import { NextRequest } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";
import {
  importFullSeasonSchedule,
  refreshMatchResults,
  runImportOdds,
  runCalculateRatings,
  generatePredictions,
  evaluatePredictions,
} from "@/lib/jobs/pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ProgressEvent =
  | { step: string; status: "running" }
  | { step: string; status: "done"; detail: string }
  | { step: string; status: "skipped"; reason: string }
  | { step: string; status: "error"; error: string }
  | { status: "complete" }
  | { status: "failed"; error: string };

function encode(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: NextRequest) {
  const season =
    Number(request.nextUrl.searchParams.get("season")) ||
    new Date().getUTCFullYear();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) =>
        controller.enqueue(new TextEncoder().encode(encode(event)));

      try {
        // 1. Fixtures
        send({ step: "Importing fixtures", status: "running" });
        const fixtures = await importFullSeasonSchedule(season);
        send({
          step: "Importing fixtures",
          status: "done",
          detail: `${fixtures.written} upserted (${fixtures.read} from API)`,
        });

        // 2. Results
        send({ step: "Refreshing results", status: "running" });
        const results = await refreshMatchResults(season);
        send({
          step: "Refreshing results",
          status: "done",
          detail: `${results.written} scores updated`,
        });

        // 3. Odds
        send({ step: "Importing odds", status: "running" });
        try {
          const odds = await runImportOdds(season);
          send({
            step: "Importing odds",
            status: "done",
            detail: `${"written" in odds ? odds.written : 0} snapshots written`,
          });
        } catch (error) {
          send({
            step: "Importing odds",
            status: "skipped",
            reason: getErrorMessage(error),
          });
        }

        // 4. Elo ratings
        send({ step: "Calculating Elo ratings", status: "running" });
        const ratings = await runCalculateRatings();
        send({
          step: "Calculating Elo ratings",
          status: "done",
          detail: `${ratings.written} snapshots written`,
        });

        // 5. Predictions
        send({ step: "Generating predictions", status: "running" });
        const predictions = await generatePredictions({
          season,
          upcomingOnly: true,
        });
        send({
          step: "Generating predictions",
          status: "done",
          detail: `${predictions.written} predictions generated`,
        });

        // 6. Evaluation
        send({ step: "Evaluating past predictions", status: "running" });
        const evaluation = await evaluatePredictions({ season });
        send({
          step: "Evaluating past predictions",
          status: "done",
          detail: `${evaluation.written} graded`,
        });

        send({ status: "complete" });
      } catch (error) {
        send({ status: "failed", error: getErrorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
