import type { CompetitionId, Match, Team, Tournament } from '../../domain/types.ts';
import type { DataProvider, ProviderSeason } from '../DataProvider.ts';
import {
  ESPN_CUP_LEAGUES,
  espnLeaguesForSeason,
  mapCupSlug,
  mapEvent,
  mapGroups,
  mapTeam,
  PROVIDER_ID,
  TOURNAMENT_NAMES,
  unknownTeams,
} from './mapping.ts';
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
    return competition === 'lpf' ? this.getLeagueSeason(season) : this.getCupSeason(competition, season);
  }

  /** `dates`: un año (`2026`) o un día (`20261027`). ESPN no acepta rangos. */
  private scoreboard(league: string, dates: number | string) {
    return this.fetchJson<EspnScoreboard>(`${BASE}/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}&limit=1000`);
  }

  async getMatchesOn(competition: CompetitionId, season: number, days: string[]): Promise<Match[]> {
    const leagues = competition === 'lpf' ? espnLeaguesForSeason(season) : [ESPN_CUP_LEAGUES[competition]];
    const boards = await Promise.all(leagues.flatMap((league) => days.map(async (day) => ({ league, board: await this.scoreboard(league, day) }))));
    return boards.flatMap(({ league, board }) =>
      board.events.flatMap((e) => {
        if (competition === 'lpf') return [mapEvent(league, e)];
        const where = mapCupSlug(competition, e.season.slug);
        return where ? [mapEvent(league, e, where)] : [];
      }),
    );
  }

  private async getLeagueSeason(season: number): Promise<ProviderSeason> {
    const teams = new Map<string, Team>();
    const tournaments = new Map<string, Tournament>();
    const matches: ProviderSeason['matches'] = [];

    for (const league of espnLeaguesForSeason(season)) {
      const [scoreboard, standings] = await Promise.all([
        this.scoreboard(league, season),
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

  /** Copas: solo las fases de eliminación que nos interesan. Los equipos de otras categorías o países tienen id provisorio. */
  private async getCupSeason(competition: Exclude<CompetitionId, 'lpf'>, season: number): Promise<ProviderSeason> {
    const league = ESPN_CUP_LEAGUES[competition];
    const scoreboard = await this.scoreboard(league, season);
    const teams = new Map<string, Team>();
    const matches: Match[] = [];
    for (const e of scoreboard.events) {
      const where = mapCupSlug(competition, e.season.slug);
      if (!where) continue;
      matches.push(mapEvent(league, e, where));
      for (const c of e.competitions[0].competitors) teams.set(mapTeam(c.team).id, mapTeam(c.team));
    }
    return { teams: [...teams.values()], tournaments: [{ id: competition, name: TOURNAMENT_NAMES[competition] }], matches };
  }
}

async function defaultFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN: ${res.status} en ${url}`);
  const json = (await res.json()) as T & { code?: number; message?: string };
  if (json.code && json.message) throw new Error(`ESPN: ${json.code} ${json.message} en ${url}`);
  return json;
}
