import axios from "axios";
import * as cheerio from "cheerio";
import { MatchStatus } from "@prisma/client";

const SCRAPER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

export type FixtureRow = {
  externalId: string;
  season: number;
  round: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  sourceUrl: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
};

function parseStatus(raw: string): MatchStatus {
  const value = raw.toLowerCase();
  if (value.includes("full time") || value.includes("finished")) return MatchStatus.FINISHED;
  if (value.includes("live")) return MatchStatus.LIVE;
  if (value.includes("postpon")) return MatchStatus.POSTPONED;
  if (value.includes("cancel")) return MatchStatus.CANCELLED;
  return MatchStatus.SCHEDULED;
}

export async function scrapeNrlFixtures(season: number): Promise<FixtureRow[]> {
  const url = `https://www.nrl.com/draw/?competition=111&season=${season}`;
  const res = await axios.get(url, { timeout: 20000, headers: SCRAPER_HEADERS });
  const $ = cheerio.load(res.data);
  const rows: FixtureRow[] = [];

  $("[data-testid='draw-match-card'], .match-card, .u-match-card").each((_, el) => {
    const homeTeamName = $(el).find("[data-testid='home-team-name'], .home-team .team-name").first().text().trim();
    const awayTeamName = $(el).find("[data-testid='away-team-name'], .away-team .team-name").first().text().trim();
    const kickoffRaw = $(el).find("time").attr("datetime") || $(el).find(".match-time").text().trim();
    const venue = $(el).find(".match-venue, [data-testid='match-venue']").first().text().trim() || undefined;
    const roundRaw = $(el).find(".round, [data-testid='round-number'], [data-testid='round-title']").text().replace(/[^0-9]/g, "");
    const statusRaw = $(el).find("[data-testid='match-status'], .match-status").first().text().trim();
    const homeScoreRaw = $(el).find("[data-testid='home-team-score'], .home-team .score").first().text().trim();
    const awayScoreRaw = $(el).find("[data-testid='away-team-score'], .away-team .score").first().text().trim();
    const href = $(el).find("a").attr("href") || "";

    if (!homeTeamName || !awayTeamName || !kickoffRaw) return;

    const kickoffAt = new Date(kickoffRaw);
    if (Number.isNaN(kickoffAt.valueOf())) return;

    const homeScore = homeScoreRaw ? Number(homeScoreRaw) : undefined;
    const awayScore = awayScoreRaw ? Number(awayScoreRaw) : undefined;

    rows.push({
      externalId: href || `${homeTeamName}-${awayTeamName}-${kickoffAt.toISOString()}`,
      season,
      round: Number(roundRaw) || 0,
      kickoffAt,
      homeTeamName,
      awayTeamName,
      venue,
      sourceUrl: href.startsWith("http") ? href : `https://www.nrl.com${href}`,
      status: parseStatus(statusRaw),
      homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: Number.isFinite(awayScore) ? awayScore : undefined
    });
  });

  return rows;
}
