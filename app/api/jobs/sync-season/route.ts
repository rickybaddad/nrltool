import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season = Number(body?.season) || new Date().getUTCFullYear();
    const { runSyncSeason } = await import("@/lib/jobs/pipeline");
    const result = await runSyncSeason(season);
    return NextResponse.json({ ok: true, season, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
