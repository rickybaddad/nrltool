import { prisma } from "@/lib/db/prisma";

export function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function resolveTeamId(rawName: string): Promise<string | null> {
  const normalized = normalizeName(rawName);

  // 1. Check aliases table (exact normalized match)
  const alias = await prisma.teamAlias.findFirst({
    where: { normalized },
  });
  if (alias) return alias.teamId;

  // 2. Fuzzy match against team name / shortName
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { name: { contains: rawName, mode: "insensitive" } },
        { shortName: { contains: rawName, mode: "insensitive" } },
      ],
    },
  });
  if (team) return team.id;

  return null;
}
