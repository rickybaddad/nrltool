import { NextResponse } from "next/server";

export async function POST() {
  const [{ runSeedTeams }, { runBootstrap }] = await Promise.all([
    import("@/lib/jobs/seed-teams"),
    import("@/lib/jobs/pipeline")
  ]);

  const seeded = await runSeedTeams();
  const result = await runBootstrap();
  return NextResponse.json({ ok: true, seeded, result });
}
