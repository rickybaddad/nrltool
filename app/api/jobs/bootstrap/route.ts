import { NextResponse } from "next/server";
import { runBootstrap } from "@/lib/jobs/pipeline";
import { runSeedTeams } from "@/lib/jobs/seed-teams";

export async function POST() {
  const seeded = await runSeedTeams();
  const result = await runBootstrap();
  return NextResponse.json({ ok: true, seeded, result });
}
