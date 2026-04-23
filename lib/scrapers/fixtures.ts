import axios from "axios";
import * as cheerio from "cheerio";

const SCRAPER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

export type FixtureRow = {
  externalId: string;
  round: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  sourceUrl: string;
};

export async function scrapeNrlFixtures(url = "https://www.nrl.com/draw/"): Promise<FixtureRow[]> {
  const res = await axios.get(url, { timeout: 15000, headers: SCRAPER_HEADERS });
  const $ = cheerio.load(res.data);
  const rows: FixtureRow[] = [];

  $("[data-testid='draw-match-card'], .match-card, .u-match-card").each((_, el) => {
    const homeTeamName = $(el).find("[data-testid='home-team-name'], .home-team .team-name").first().text().trim();
    const awayTeamName = $(el).find("[data-testid='away-team-name'], .away-team .team-name").first().text().trim();
    const kickoffRaw = $(el).find("time").attr("datetime") || $(el).find(".match-time").text().trim();
    const venue = $(el).find(".match-venue").text().trim() || undefined;
    const roundRaw = $(el).find(".round, [data-testid='round-number']").text().replace(/[^0-9]/g, "");
    const href = $(el).find("a").attr("href") || "";

    if (!homeTeamName || !awayTeamName || !kickoffRaw) return;

    const kickoffAt = new Date(kickoffRaw);
    if (Number.isNaN(kickoffAt.valueOf())) return;

    rows.push({
      externalId: href || `${homeTeamName}-${awayTeamName}-${kickoffAt.toISOString()}`,
      round: Number(roundRaw) || 0,
      kickoffAt,
      homeTeamName,
      awayTeamName,
      venue,
      sourceUrl: href.startsWith("http") ? href : `https://www.nrl.com${href}`
    });
  });

  return rows;
}
