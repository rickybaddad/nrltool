import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const seasons = await prisma.match.findMany({
    distinct: ["season"],
    select: { season: true },
    orderBy: { season: "desc" },
  });

  const years = seasons.map((s) => s.season);
  return NextResponse.json(years);
}

export async function GET() {
  const seasons = await prisma.match.findMany({
    distinct: ["season"],
    select: { season: true },
    orderBy: { season: "desc" }
  });

  return NextResponse.json(seasons.map((s) => s.season));
}
