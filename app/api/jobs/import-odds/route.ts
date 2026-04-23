import { NextResponse } from "next/server";

export async function POST() {
  const { runImportOdds } = await import("@/lib/jobs/pipeline");
  const result = await runImportOdds();
  return NextResponse.json({ ok: true, result });
}
