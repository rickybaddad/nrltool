import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";

export async function POST() {
  try {
    const { runSyncResults } = await import("@/lib/jobs/sync-results");
    const summary = await runSyncResults();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
