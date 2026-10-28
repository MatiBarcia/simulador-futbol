import type { CompetitionId, Match, Team, Tournament } from '../domain/types.ts';

/** Datos crudos de una temporada, ya traducidos a nuestro modelo. */
export interface ProviderSeason {
  teams: Team[];
  tournaments: Tournament[];
  matches: Match[];
}

/** Lo único que la app sabe de una fuente de datos. Cada proveedor (ESPN, API-Football, ...) lo implementa. */
export interface DataProvider {
  readonly id: string;
  getSeason(competition: CompetitionId, season: number): Promise<ProviderSeason>;
  /** Partidos de algunos días (`YYYYMMDD`): para tener los resultados del día sin bajar toda la temporada. */
  getMatchesOn(competition: CompetitionId, season: number, days: string[]): Promise<Match[]>;
}
