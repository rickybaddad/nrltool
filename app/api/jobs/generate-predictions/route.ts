import { NextResponse } from "next/server";
import { runGeneratePredictions } from "@/lib/jobs/pipeline";

export async function POST() {
  const result = await runGeneratePredictions();
  return NextResponse.json({ ok: true, result });
}
