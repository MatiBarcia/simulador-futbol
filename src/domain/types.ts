// Modelo de dominio. Nada acá conoce el formato de ningún proveedor de datos.

export type TeamId = string; // id propio y estable, ej. 'river-plate'
export type CompetitionId = 'lpf' | 'copa-argentina' | 'libertadores' | 'sudamericana' | 'supercopa-argentina';

export const CUP_COMPETITIONS = ['copa-argentina', 'libertadores', 'sudamericana', 'supercopa-argentina'] as const satisfies CompetitionId[];

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'suspended' | 'cancelled';

/** Fase de un torneo: la fase regular (zonas o todos contra todos) o una ronda de playoffs. */
export type Phase = 'regular' | 'round-of-64' | 'round-of-32' | 'round-of-16' | 'quarterfinals' | 'semifinals' | 'final';

export interface Team {
  id: TeamId;
  name: string;
  shortName: string;
  logoUrl?: string;
}

/** Un torneo dentro de una temporada: Apertura, Clausura, Copa de la Liga, Liga... */
export interface Tournament {
  id: string; // 'apertura' | 'clausura' | 'copa-de-la-liga' | 'liga'
  name: string;
  /** Zonas de la fase regular. Sin zonas = todos contra todos. */
  groups?: Record<string, TeamId[]>;
}

export interface Match {
  id: string;
  tournamentId: string;
  phase: Phase;
  /** Número de fecha (solo en la fase regular). Inferido si el proveedor no lo da. */
  round?: number;
  date: string; // ISO 8601
  homeId: TeamId;
  awayId: TeamId;
  status: MatchStatus;
  homeGoals?: number;
  awayGoals?: number;
  penalties?: { home: number; away: number };
  /** Minuto o estado corto mientras se juega, ej. "67'" o "ET". */
  clock?: string;
  source: { provider: string; externalId: string };
}

export interface SeasonData {
  competition: CompetitionId;
  season: number;
  provider: string;
  generatedAt: string;
  teams: Team[];
  tournaments: Tournament[];
  matches: Match[];
}

export const isPlayed = (m: Match) => m.status === 'finished' && m.homeGoals !== undefined && m.awayGoals !== undefined;
