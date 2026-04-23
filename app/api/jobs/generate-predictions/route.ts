import { NextResponse } from "next/server";

export async function POST() {
  const { runGeneratePredictions } = await import("@/lib/jobs/pipeline");
  const result = await runGeneratePredictions();
  return NextResponse.json({ ok: true, result });
}
