import type { CompetitionId, Team, Tournament } from '../../domain/types.ts';
import type { DataProvider, ProviderSeason } from '../DataProvider.ts';
import { espnLeaguesForSeason, mapEvent, mapGroups, mapTeam, PROVIDER_ID, TOURNAMENT_NAMES, unknownTeams } from './mapping.ts';
import type { EspnScoreboard, EspnStandings } from './types.ts';

const BASE = 'https://site.api.espn.com/apis';

export class EspnProvider implements DataProvider {
  readonly id = PROVIDER_ID;
  private readonly fetchJson: <T>(url: string) => Promise<T>;
  private readonly warn: (msg: string) => void;

  constructor(options: { fetchJson?: <T>(url: string) => Promise<T>; warn?: (msg: string) => void } = {}) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.warn = options.warn ?? console.warn;
  }

  async getSeason(competition: CompetitionId, season: number): Promise<ProviderSeason> {
    if (competition !== 'lpf') throw new Error(`ESPN: competencia no soportada: ${competition}`);
    const teams = new Map<string, Team>();
    const tournaments = new Map<string, Tournament>();
    const matches: ProviderSeason['matches'] = [];

    for (const league of espnLeaguesForSeason(season)) {
      const [scoreboard, standings] = await Promise.all([
        this.fetchJson<EspnScoreboard>(`${BASE}/site/v2/sports/soccer/${league}/scoreboard?dates=${season}&limit=1000`),
        this.fetchJson<EspnStandings>(`${BASE}/v2/sports/soccer/${league}/standings?season=${season}`),
      ]);
      const espnTeams = scoreboard.events.flatMap((e) => e.competitions[0].competitors.map((c) => c.team));
      for (const t of unknownTeams(espnTeams)) {
        if (!teams.has(mapTeam(t).id)) this.warn(`ESPN: equipo sin id propio, agregarlo a teamIds.ts: ${t.id} ${t.displayName}`);
      }
      for (const t of espnTeams) teams.set(mapTeam(t).id, mapTeam(t));

      const groups = mapGroups(standings);
      for (const e of scoreboard.events) {
        const match = mapEvent(league, e);
        matches.push(match);
        if (!tournaments.has(match.tournamentId)) {
          tournaments.set(match.tournamentId, {
            id: match.tournamentId,
            name: TOURNAMENT_NAMES[match.tournamentId] ?? match.tournamentId,
            // Las zonas de ESPN son las de la temporada; solo tienen sentido en torneos con zonas.
            ...(groups && Object.keys(groups).length > 1 ? { groups } : {}),
          });
        }
      }
    }

    return { teams: [...teams.values()], tournaments: [...tournaments.values()], matches };
  }
}

async function defaultFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN: ${res.status} en ${url}`);
  const json = (await res.json()) as T & { code?: number; message?: string };
  if (json.code && json.message) throw new Error(`ESPN: ${json.code} ${json.message} en ${url}`);
  return json;
}
