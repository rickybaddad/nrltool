import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEAMS = [
  {
    slug: "brisbane-broncos",
    name: "Brisbane Broncos",
    shortName: "Broncos",
    aliases: ["Brisbane", "Brisbane Broncos", "Broncos", "Brisbane Broncs", "BRI"],
  },
  {
    slug: "canberra-raiders",
    name: "Canberra Raiders",
    shortName: "Raiders",
    aliases: ["Canberra", "Canberra Raiders", "Raiders", "CBR"],
  },
  {
    slug: "canterbury-bulldogs",
    name: "Canterbury-Bankstown Bulldogs",
    shortName: "Bulldogs",
    aliases: ["Canterbury", "Bulldogs", "Canterbury Bulldogs", "Canterbury-Bankstown", "CBY"],
  },
  {
    slug: "cronulla-sharks",
    name: "Cronulla-Sutherland Sharks",
    shortName: "Sharks",
    aliases: ["Cronulla", "Sharks", "Cronulla Sharks", "Cronulla-Sutherland", "CRO"],
  },
  {
    slug: "dolphins",
    name: "The Dolphins",
    shortName: "Dolphins",
    aliases: ["Dolphins", "Redcliffe", "The Dolphins", "Redcliffe Dolphins", "DOL"],
  },
  {
    slug: "gold-coast-titans",
    name: "Gold Coast Titans",
    shortName: "Titans",
    aliases: ["Gold Coast", "Titans", "Gold Coast Titans", "GLD"],
  },
  {
    slug: "manly-sea-eagles",
    name: "Manly Warringah Sea Eagles",
    shortName: "Sea Eagles",
    aliases: ["Manly", "Sea Eagles", "Manly Sea Eagles", "Manly Warringah", "MAN"],
  },
  {
    slug: "melbourne-storm",
    name: "Melbourne Storm",
    shortName: "Storm",
    aliases: ["Melbourne", "Storm", "Melbourne Storm", "MEL"],
  },
  {
    slug: "newcastle-knights",
    name: "Newcastle Knights",
    shortName: "Knights",
    aliases: ["Newcastle", "Knights", "Newcastle Knights", "NEW"],
  },
  {
    slug: "new-zealand-warriors",
    name: "New Zealand Warriors",
    shortName: "Warriors",
    aliases: ["Warriors", "NZ Warriors", "New Zealand", "New Zealand Warriors", "WAR"],
  },
  {
    slug: "north-queensland-cowboys",
    name: "North Queensland Cowboys",
    shortName: "Cowboys",
    aliases: ["Cowboys", "North Queensland", "NQ Cowboys", "North Queensland Cowboys", "NQL"],
  },
  {
    slug: "parramatta-eels",
    name: "Parramatta Eels",
    shortName: "Eels",
    aliases: ["Parramatta", "Eels", "Parramatta Eels", "PAR"],
  },
  {
    slug: "penrith-panthers",
    name: "Penrith Panthers",
    shortName: "Panthers",
    aliases: ["Penrith", "Panthers", "Penrith Panthers", "PEN"],
  },
  {
    slug: "south-sydney-rabbitohs",
    name: "South Sydney Rabbitohs",
    shortName: "Rabbitohs",
    aliases: ["South Sydney", "Rabbitohs", "Souths", "South Sydney Rabbitohs", "SOU"],
  },
  {
    slug: "st-george-illawarra-dragons",
    name: "St George Illawarra Dragons",
    shortName: "Dragons",
    aliases: ["St George", "Dragons", "St George Illawarra", "St George Illawarra Dragons", "SGI"],
  },
  {
    slug: "sydney-roosters",
    name: "Sydney Roosters",
    shortName: "Roosters",
    aliases: ["Roosters", "Sydney Roosters", "Eastern Suburbs", "SYD"],
  },
  {
    slug: "wests-tigers",
    name: "Wests Tigers",
    shortName: "Tigers",
    aliases: ["Wests Tigers", "Tigers", "Balmain-Wests", "Wests", "WST"],
  },
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function seedTeams(): Promise<void> {
  for (const team of TEAMS) {
    const saved = await prisma.team.upsert({
      where: { slug: team.slug },
      update: { name: team.name, shortName: team.shortName },
      create: { slug: team.slug, name: team.name, shortName: team.shortName },
    });

    for (const alias of team.aliases) {
      await prisma.teamAlias.upsert({
        where: { alias },
        update: { normalized: normalizeName(alias), source: "seed", teamId: saved.id },
        create: { alias, normalized: normalizeName(alias), source: "seed", teamId: saved.id },
      });
    }
  }
}

export async function seedCurrentSeason(): Promise<void> {
  const year = new Date().getUTCFullYear();
  await prisma.season.upsert({
    where: { year },
    update: { isActive: true },
    create: { year, isActive: true },
  });
}

async function main() {
  console.log("Seeding teams…");
  await seedTeams();
  console.log("Seeding active season…");
  await seedCurrentSeason();
  console.log("Seed complete.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
