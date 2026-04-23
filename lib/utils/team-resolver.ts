import { prisma } from "@/lib/db/prisma";

export function normalizeName(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function resolveTeamId(name: string): Promise<string | null> {
  const normalized = normalizeName(name);
  const alias = await prisma.teamAlias.findFirst({ where: { normalized }, include: { team: true } });
  if (alias) return alias.teamId;

  const team = await prisma.team.findFirst({ where: { OR: [{ fullName: { contains: name, mode: "insensitive" } }, { shortName: { contains: name, mode: "insensitive" } }] } });
  if (team) return team.id;

  return null;
}
