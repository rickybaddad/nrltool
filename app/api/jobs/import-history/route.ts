import { NextResponse } from "next/server";
import { runImportHistory } from "@/lib/jobs/pipeline";

export async function POST() {
  const result = await runImportHistory();
  return NextResponse.json({ ok: true, result });
}
