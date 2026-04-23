import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Look up by slug first, fall back to id
  const match = await prisma.match.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { pulledAt: "desc" }, take: 10 },
      predictions: { orderBy: { generatedAt: "desc" }, take: 5 },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return NextResponse.json(match);
}
