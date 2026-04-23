import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";
import { PredictionScope } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season = Number(body?.season) || new Date().getUTCFullYear();
    const round = body?.round != null ? Number(body.round) : undefined;

    const { runGeneratePredictions } = await import("@/lib/jobs/pipeline");
    const result = await runGeneratePredictions({ season, round, upcomingOnly: false, scope: PredictionScope.ROUND_VIEW });
    return NextResponse.json({ ok: true, season, round, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
