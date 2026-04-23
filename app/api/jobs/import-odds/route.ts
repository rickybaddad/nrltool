import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST() {
  try {
    const { runImportOdds } = await import("@/lib/jobs/pipeline");
    const result = await runImportOdds();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
