import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { runGeneratePredictions } = await import("@/lib/jobs/pipeline");
    const result = await runGeneratePredictions({
      season: body?.season != null ? Number(body.season) : undefined,
      round: body?.round != null ? Number(body.round) : undefined,
      upcomingOnly: body?.upcomingOnly ?? true,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Generate predictions failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
