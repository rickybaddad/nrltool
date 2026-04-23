import { NextResponse } from "next/server";

export async function POST() {
  const { runImportFixtures } = await import("@/lib/jobs/pipeline");
  const result = await runImportFixtures();
  return NextResponse.json({ ok: true, result });
}
