import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const seasons = await prisma.match.findMany({
    distinct: ["season"],
    select: { season: true },
    orderBy: { season: "desc" }
  });

  return NextResponse.json(seasons.map((s) => s.season));
}
