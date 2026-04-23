export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getErrorMessage, isDatabaseConnectivityError } from "@/lib/utils/error-message";

export async function GET() {
  try {
    const now = new Date();
    const predictions = await prisma.prediction.findMany({
      where: { match: { kickoffAt: { gte: now } } },
      include: { match: true, homeTeam: true, awayTeam: true },
      orderBy: { generatedAt: "desc" }
    });
    return NextResponse.json(predictions);
  } catch (error) {
    const message = isDatabaseConnectivityError(error)
      ? "Predictions are temporarily unavailable. Please check your database connection and try again."
      : `Failed to load predictions: ${getErrorMessage(error)}`;

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
