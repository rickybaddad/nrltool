import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const teams = [
  {
    slug: "brisbane-broncos",
    fullName: "Brisbane Broncos",
    shortName: "Broncos",
    aliases: ["Brisbane", "Brisbane Broncos", "Broncos", "Brisbane Broncs"]
  },
  { slug: "canberra-raiders", fullName: "Canberra Raiders", shortName: "Raiders", aliases: ["Canberra", "Canberra Raiders", "Raiders"] },
  { slug: "canterbury-bulldogs", fullName: "Canterbury-Bankstown Bulldogs", shortName: "Bulldogs", aliases: ["Canterbury", "Bulldogs", "Canterbury Bulldogs", "Canterbury-Bankstown"] },
  { slug: "cronulla-sharks", fullName: "Cronulla-Sutherland Sharks", shortName: "Sharks", aliases: ["Cronulla", "Sharks", "Cronulla Sharks"] },
  { slug: "dolphins", fullName: "The Dolphins", shortName: "Dolphins", aliases: ["Dolphins", "Redcliffe", "The Dolphins"] },
  { slug: "gold-coast-titans", fullName: "Gold Coast Titans", shortName: "Titans", aliases: ["Gold Coast", "Titans", "Gold Coast Titans"] },
  { slug: "manly-sea-eagles", fullName: "Manly Warringah Sea Eagles", shortName: "Sea Eagles", aliases: ["Manly", "Sea Eagles", "Manly Sea Eagles"] },
  { slug: "melbourne-storm", fullName: "Melbourne Storm", shortName: "Storm", aliases: ["Melbourne", "Storm", "Melbourne Storm"] },
  { slug: "newcastle-knights", fullName: "Newcastle Knights", shortName: "Knights", aliases: ["Newcastle", "Knights", "Newcastle Knights"] },
  { slug: "new-zealand-warriors", fullName: "New Zealand Warriors", shortName: "Warriors", aliases: ["Warriors", "NZ Warriors", "New Zealand"] },
  { slug: "north-queensland-cowboys", fullName: "North Queensland Cowboys", shortName: "Cowboys", aliases: ["Cowboys", "North Queensland", "NQ Cowboys"] },
  { slug: "parramatta-eels", fullName: "Parramatta Eels", shortName: "Eels", aliases: ["Parramatta", "Eels", "Parramatta Eels"] },
  { slug: "penrith-panthers", fullName: "Penrith Panthers", shortName: "Panthers", aliases: ["Penrith", "Panthers", "Penrith Panthers"] },
  { slug: "south-sydney-rabbitohs", fullName: "South Sydney Rabbitohs", shortName: "Rabbitohs", aliases: ["South Sydney", "Rabbitohs", "Souths"] },
  { slug: "st-george-illawarra-dragons", fullName: "St George Illawarra Dragons", shortName: "Dragons", aliases: ["St George", "Dragons", "St George Illawarra"] },
  { slug: "sydney-roosters", fullName: "Sydney Roosters", shortName: "Roosters", aliases: ["Roosters", "Sydney Roosters", "Eastern Suburbs"] },
  { slug: "wests-tigers", fullName: "Wests Tigers", shortName: "Tigers", aliases: ["Wests Tigers", "Tigers", "Balmain-Wests"] }
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function seedTeams() {
  for (const team of teams) {
    const saved = await prisma.team.upsert({
      where: { slug: team.slug },
      update: { fullName: team.fullName, shortName: team.shortName },
      create: { slug: team.slug, fullName: team.fullName, shortName: team.shortName }
    });

    for (const alias of team.aliases) {
      await prisma.teamAlias.upsert({
        where: { alias },
        update: {
          normalized: normalizeName(alias),
          source: "seed",
          teamId: saved.id
        },
        create: {
          alias,
          normalized: normalizeName(alias),
          source: "seed",
          teamId: saved.id
        }
      });
    }
  }
}

if (require.main === module) {
  seedTeams()
    .then(async () => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
