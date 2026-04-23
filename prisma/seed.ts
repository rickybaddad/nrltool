import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEAMS = [
  {
    slug: "brisbane-broncos",
    name: "Brisbane Broncos",
    shortName: "Broncos",
    aliases: ["Brisbane Broncos", "Broncos", "Brisbane"],
  },
  {
    slug: "canberra-raiders",
    name: "Canberra Raiders",
    shortName: "Raiders",
    aliases: ["Canberra Raiders", "Raiders", "Canberra"],
  },
  {
    slug: "canterbury-bulldogs",
    name: "Canterbury Bulldogs",
    shortName: "Bulldogs",
    aliases: ["Canterbury Bulldogs", "Bulldogs", "Canterbury", "Canterbury-Bankstown Bulldogs"],
  },
  {
    slug: "cronulla-sharks",
    name: "Cronulla Sharks",
    shortName: "Sharks",
    aliases: ["Cronulla Sharks", "Sharks", "Cronulla", "Cronulla-Sutherland Sharks"],
  },
  {
    slug: "gold-coast-titans",
    name: "Gold Coast Titans",
    shortName: "Titans",
    aliases: ["Gold Coast Titans", "Titans", "Gold Coast"],
  },
  {
    slug: "manly-sea-eagles",
    name: "Manly Sea Eagles",
    shortName: "Sea Eagles",
    aliases: ["Manly Sea Eagles", "Sea Eagles", "Manly", "Manly-Warringah Sea Eagles", "Manly Warringah Sea Eagles"],
  },
  {
    slug: "melbourne-storm",
    name: "Melbourne Storm",
    shortName: "Storm",
    aliases: ["Melbourne Storm", "Storm", "Melbourne"],
  },
  {
    slug: "newcastle-knights",
    name: "Newcastle Knights",
    shortName: "Knights",
    aliases: ["Newcastle Knights", "Knights", "Newcastle"],
  },
  {
    slug: "new-zealand-warriors",
    name: "New Zealand Warriors",
    shortName: "Warriors",
    aliases: ["New Zealand Warriors", "Warriors", "NZ Warriors", "New Zealand"],
  },
  {
    slug: "north-queensland-cowboys",
    name: "North Queensland Cowboys",
    shortName: "Cowboys",
    aliases: ["North Queensland Cowboys", "Cowboys", "North Queensland", "NQ Cowboys"],
  },
  {
    slug: "parramatta-eels",
    name: "Parramatta Eels",
    shortName: "Eels",
    aliases: ["Parramatta Eels", "Eels", "Parramatta"],
  },
  {
    slug: "penrith-panthers",
    name: "Penrith Panthers",
    shortName: "Panthers",
    aliases: ["Penrith Panthers", "Panthers", "Penrith"],
  },
  {
    slug: "south-sydney-rabbitohs",
    name: "South Sydney Rabbitohs",
    shortName: "Rabbitohs",
    aliases: ["South Sydney Rabbitohs", "Rabbitohs", "South Sydney", "Souths"],
  },
  {
    slug: "st-george-illawarra-dragons",
    name: "St. George Illawarra Dragons",
    shortName: "Dragons",
    aliases: ["St. George Illawarra Dragons", "St George Illawarra Dragons", "Dragons", "St George", "St. George"],
  },
  {
    slug: "sydney-roosters",
    name: "Sydney Roosters",
    shortName: "Roosters",
    aliases: ["Sydney Roosters", "Roosters", "Sydney", "Eastern Suburbs Roosters"],
  },
  {
    slug: "wests-tigers",
    name: "Wests Tigers",
    shortName: "Tigers",
    aliases: ["Wests Tigers", "Tigers", "Wests"],
  },
  {
    slug: "dolphins",
    name: "The Dolphins",
    shortName: "Dolphins",
    aliases: ["The Dolphins", "Dolphins", "Redcliffe Dolphins"],
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
