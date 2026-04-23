import { NextResponse } from "next/server";
import { runImportFixtures } from "@/lib/jobs/pipeline";

export async function POST() {
  const result = await runImportFixtures();
  return NextResponse.json({ ok: true, result });
}
