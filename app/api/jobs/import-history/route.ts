import { NextResponse } from "next/server";

export async function POST() {
  const { runImportHistory } = await import("@/lib/jobs/pipeline");
  const result = await runImportHistory();
  return NextResponse.json({ ok: true, result });
}
