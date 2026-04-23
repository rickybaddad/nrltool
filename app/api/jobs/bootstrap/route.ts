import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season = Number(body?.season) || new Date().getUTCFullYear();

    const [{ runSeedTeams }, { runBootstrap }] = await Promise.all([
      import("@/lib/jobs/seed-teams"),
      import("@/lib/jobs/pipeline")
    ]);

    const seeded = await runSeedTeams();
    const result = await runBootstrap(season);
    return NextResponse.json({ ok: true, season, seeded, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
