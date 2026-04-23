export const CANONICAL_TEAMS = [
  "Brisbane Broncos",
  "Canberra Raiders",
  "Canterbury Bulldogs",
  "Cronulla Sharks",
  "Gold Coast Titans",
  "Manly Sea Eagles",
  "Melbourne Storm",
  "Newcastle Knights",
  "New Zealand Warriors",
  "North Queensland Cowboys",
  "Parramatta Eels",
  "Penrith Panthers",
  "South Sydney Rabbitohs",
  "St. George Illawarra Dragons",
  "Sydney Roosters",
  "Wests Tigers",
  "The Dolphins",
] as const;

export type CanonicalTeamName = (typeof CANONICAL_TEAMS)[number];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Maps normalized input → canonical DB team name.
// Covers TheSportsDB names, common abbreviations, and known typos.
const ALIAS_MAP: Record<string, CanonicalTeamName> = {
  // Brisbane Broncos
  brisbanebroncos: "Brisbane Broncos",
  brisbane: "Brisbane Broncos",
  broncos: "Brisbane Broncos",
  bri: "Brisbane Broncos",
  brisbanebroncs: "Brisbane Broncos",

  // Canberra Raiders
  canberraraiders: "Canberra Raiders",
  canberra: "Canberra Raiders",
  raiders: "Canberra Raiders",
  cbr: "Canberra Raiders",

  // Canterbury Bulldogs
  canterburybulldogs: "Canterbury Bulldogs",
  canterbury: "Canterbury Bulldogs",
  bulldogs: "Canterbury Bulldogs",
  canterburybankstownbulldogs: "Canterbury Bulldogs",
  canterburybankstown: "Canterbury Bulldogs",
  cby: "Canterbury Bulldogs",

  // Cronulla Sharks
  cronullasharks: "Cronulla Sharks",
  cronulla: "Cronulla Sharks",
  sharks: "Cronulla Sharks",
  cronullasutherlandsharks: "Cronulla Sharks",
  cronullasutherland: "Cronulla Sharks",
  cro: "Cronulla Sharks",

  // Gold Coast Titans
  goldcoasttitans: "Gold Coast Titans",
  goldcoast: "Gold Coast Titans",
  titans: "Gold Coast Titans",
  gct: "Gold Coast Titans",

  // Manly Sea Eagles
  manlyseaeagles: "Manly Sea Eagles",
  manly: "Manly Sea Eagles",
  seaeagles: "Manly Sea Eagles",
  manlywarringahseaeagles: "Manly Sea Eagles",
  mly: "Manly Sea Eagles",

  // Melbourne Storm
  melbournestorm: "Melbourne Storm",
  melbourne: "Melbourne Storm",
  storm: "Melbourne Storm",
  mel: "Melbourne Storm",

  // Newcastle Knights
  newcastleknights: "Newcastle Knights",
  newcastle: "Newcastle Knights",
  knights: "Newcastle Knights",
  new: "Newcastle Knights",

  // New Zealand Warriors
  newzealandwarriors: "New Zealand Warriors",
  warriors: "New Zealand Warriors",
  nzwarriors: "New Zealand Warriors",
  newzealand: "New Zealand Warriors",
  nzw: "New Zealand Warriors",

  // North Queensland Cowboys
  northqueenslandcowboys: "North Queensland Cowboys",
  cowboys: "North Queensland Cowboys",
  northqueensland: "North Queensland Cowboys",
  nqcowboys: "North Queensland Cowboys",
  nqc: "North Queensland Cowboys",

  // Parramatta Eels
  parramattaeels: "Parramatta Eels",
  parramatta: "Parramatta Eels",
  eels: "Parramatta Eels",
  par: "Parramatta Eels",

  // Penrith Panthers
  penrithpanthers: "Penrith Panthers",
  penrith: "Penrith Panthers",
  panthers: "Penrith Panthers",
  pen: "Penrith Panthers",

  // South Sydney Rabbitohs
  southsydneyrabbitohs: "South Sydney Rabbitohs",
  southsydney: "South Sydney Rabbitohs",
  rabbitohs: "South Sydney Rabbitohs",
  souths: "South Sydney Rabbitohs",
  sou: "South Sydney Rabbitohs",

  // St. George Illawarra Dragons
  stgeorgeillawarradragons: "St. George Illawarra Dragons",
  stgeorgeillawara: "St. George Illawarra Dragons",
  stgeorgeillawaradragons: "St. George Illawarra Dragons", // TheSportsDB typo (one 'r')
  stgeorge: "St. George Illawarra Dragons",
  dragons: "St. George Illawarra Dragons",
  sgi: "St. George Illawarra Dragons",

  // Sydney Roosters
  sydneyroosters: "Sydney Roosters",
  sydney: "Sydney Roosters",
  roosters: "Sydney Roosters",
  easternsuburnsroosters: "Sydney Roosters",
  syd: "Sydney Roosters",

  // Wests Tigers
  weststigers: "Wests Tigers",
  wests: "Wests Tigers",
  tigers: "Wests Tigers",
  wst: "Wests Tigers",

  // The Dolphins
  thedolphins: "The Dolphins",
  dolphins: "The Dolphins",
  redcliffedolphins: "The Dolphins",
  dol: "The Dolphins",
};

/**
 * Maps any NRL team name variant to its canonical DB name.
 * Throws if the input cannot be matched — callers should treat unmatched
 * teams as a data-quality warning and skip the fixture.
 */
export function normalizeTeamName(input: string): CanonicalTeamName {
  const key = norm(input.trim());
  const canonical = ALIAS_MAP[key];
  if (!canonical) {
    throw new Error(`Unrecognized NRL team: "${input}" (normalized: "${key}")`);
  }
  return canonical;
}

/** Same normalization used by the DB's `normalized` column. */
export function normalizeForDb(input: string): string {
  return norm(input);
}
