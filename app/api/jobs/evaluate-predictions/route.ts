import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { runEvaluatePredictions } = await import("@/lib/jobs/pipeline");
    const result = await runEvaluatePredictions({
      season: body?.season != null ? Number(body.season) : undefined,
      round: body?.round != null ? Number(body.round) : undefined
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
