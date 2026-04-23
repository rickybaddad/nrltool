import { NextResponse } from "next/server";
import { runCalculateRatings } from "@/lib/jobs/pipeline";

export async function POST() {
  const result = await runCalculateRatings();
  return NextResponse.json({ ok: true, result });
}
