export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getErrorMessage, isDatabaseConnectivityError } from "@/lib/utils/error-message";

export async function GET() {
  try {
    const now = new Date();
    const predictions = await prisma.prediction.findMany({
      where: {
        isLatest: true,
        match: { kickoffAt: { gte: now }, status: { in: ["SCHEDULED", "LIVE"] } },
      },
      include: { match: true, homeTeam: true, awayTeam: true },
      orderBy: { match: { kickoffAt: "asc" } },
    });
    return NextResponse.json(predictions);
  } catch (error) {
    const message = isDatabaseConnectivityError(error)
      ? "Predictions unavailable — check database connection."
      : `Failed to load predictions: ${getErrorMessage(error)}`;
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
