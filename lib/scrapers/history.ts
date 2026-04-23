import axios from "axios";
import * as cheerio from "cheerio";

export type HistoryRow = {
  season: number;
  round: number;
  date: Date;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  sourceUrl: string;
};

export async function scrapeRlpSeason(season: number): Promise<HistoryRow[]> {
  const url = `https://www.rugbyleagueproject.org/seasons/nrl-${season}/summary.html`;
  const res = await axios.get(url, { timeout: 20000 });
  const $ = cheerio.load(res.data);
  const rows: HistoryRow[] = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 6) return;

    const dateRaw = $(cells[0]).text().trim();
    const roundRaw = $(cells[1]).text().trim().replace(/[^0-9]/g, "");
    const homeTeamName = $(cells[2]).text().trim();
    const homeScore = Number($(cells[3]).text().trim());
    const awayScore = Number($(cells[4]).text().trim());
    const awayTeamName = $(cells[5]).text().trim();

    const date = new Date(dateRaw);
    if (!homeTeamName || !awayTeamName || Number.isNaN(homeScore) || Number.isNaN(awayScore) || Number.isNaN(date.valueOf())) return;

    rows.push({
      season,
      round: Number(roundRaw) || 0,
      date,
      homeTeamName,
      awayTeamName,
      homeScore,
      awayScore,
      sourceUrl: url
    });
  });

  return rows;
}
