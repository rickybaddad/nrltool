import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST() {
  try {
    const { runGeneratePredictions } = await import("@/lib/jobs/pipeline");
    const result = await runGeneratePredictions();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: `Generate predictions failed: ${getErrorMessage(error)}` }, { status: 500 });
  }
}
