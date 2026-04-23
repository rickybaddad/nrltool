import { NextResponse } from "next/server";

export async function POST() {
  const { runCalculateRatings } = await import("@/lib/jobs/pipeline");
  const result = await runCalculateRatings();
  return NextResponse.json({ ok: true, result });
}
