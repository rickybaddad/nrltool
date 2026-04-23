import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const matches = await prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { kickoffAt: "asc" } });
  return NextResponse.json(matches);
}
