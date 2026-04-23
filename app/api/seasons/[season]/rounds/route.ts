import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ season: string }> }
) {
  const season = Number((await params).season);

  const rounds = await prisma.match.groupBy({
    by: ["round"],
    where: { season, round: { not: null } },
    _count: { _all: true },
    orderBy: { round: "asc" },
  });

  return NextResponse.json(
    rounds.map((r) => ({ round: r.round, matches: r._count._all }))
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ season: string }> }) {
  const season = Number((await params).season);

  const rounds = await prisma.match.groupBy({
    by: ["round"],
    where: { season, round: { not: null } },
    _count: { _all: true },
    orderBy: { round: "asc" }
  });

  return NextResponse.json(rounds.map((r) => ({ round: r.round, matches: r._count._all })));
}
