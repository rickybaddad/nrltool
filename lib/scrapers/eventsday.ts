import axios from "axios";

const API_KEY = process.env.THESPORTSDB_API_KEY || "123";
const LEAGUE_ID = process.env.THESPORTSDB_LEAGUE_ID || "4416";

export type EventsDayEvent = {
  idEvent: string;
  strEvent: string;
  dateEvent: string | null;
  strTime: string | null;
  strTimestamp: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound: string | null;
  strVenue: string | null;
  strStatus: string | null;
};

export async function fetchEventsByDay(dateStr: string): Promise<EventsDayEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${dateStr}&l=${LEAGUE_ID}`;
  const res = await axios.get<{ events: EventsDayEvent[] | null }>(url, {
    headers: { "User-Agent": "nrltool/1.0", Accept: "application/json" },
    timeout: 15000,
  });
  return res.data?.events ?? [];
}
