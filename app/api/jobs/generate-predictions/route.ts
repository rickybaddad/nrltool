import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season = body?.season != null ? Number(body.season) : new Date().getUTCFullYear();
    const { runGenerateSeasonPredictions } = await import(
      "@/lib/jobs/chronological-predictions"
    );
    const result = await runGenerateSeasonPredictions(season);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Generate predictions failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
