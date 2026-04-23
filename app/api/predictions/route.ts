export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const predictions = await prisma.prediction.findMany({ include: { match: true, homeTeam: true, awayTeam: true }, orderBy: { generatedAt: "desc" }, take: 200 });
  return NextResponse.json(predictions);
}
