import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const now = new Date();
  const predictions = await prisma.prediction.findMany({
    where: { match: { kickoffAt: { gte: now } } },
    include: { match: true, homeTeam: true, awayTeam: true },
    orderBy: { generatedAt: "desc" }
  });
  return NextResponse.json(predictions);
}
