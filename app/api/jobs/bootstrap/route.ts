import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST() {
  try {
    const [{ runSeedTeams }, { runBootstrap }] = await Promise.all([
      import("@/lib/jobs/seed-teams"),
      import("@/lib/jobs/pipeline")
    ]);

    const seeded = await runSeedTeams();
    const result = await runBootstrap();
    return NextResponse.json({ ok: true, seeded, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
