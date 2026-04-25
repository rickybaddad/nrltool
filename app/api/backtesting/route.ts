import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/error-message";
import { type ModelType, type ConfidenceFilter, getBacktestData } from "@/lib/services/backtesting";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const season = searchParams.get("season")
      ? parseInt(searchParams.get("season")!)
      : new Date().getUTCFullYear();
    const modelType = (searchParams.get("modelType") ?? "blended") as ModelType;
    const confidence = (searchParams.get("confidence") ?? "all") as ConfidenceFilter;
    const minEdge = searchParams.get("minEdge") ? parseFloat(searchParams.get("minEdge")!) : 0;

    const data = await getBacktestData({ season, modelType, confidence, minEdge });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Backtesting failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
