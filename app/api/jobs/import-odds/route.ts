import { NextResponse } from "next/server";
import { runImportOdds } from "@/lib/jobs/pipeline";

export async function POST() {
  const result = await runImportOdds();
  return NextResponse.json({ ok: true, result });
}
