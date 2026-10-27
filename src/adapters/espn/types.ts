// Forma (parcial) de las respuestas de la API no oficial de ESPN. Solo los campos que usamos.

export interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  logo?: string;
}

export interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  shootoutScore?: number;
  team: EspnTeam;
}

export interface EspnStatus {
  displayClock?: string;
  type: { name: string; state: 'pre' | 'in' | 'post'; shortDetail?: string };
}

export interface EspnEvent {
  id: string;
  date: string;
  season: { year: number; slug: string };
  status: EspnStatus;
  competitions: { competitors: EspnCompetitor[] }[];
}

export interface EspnScoreboard {
  events: EspnEvent[];
}

export interface EspnStandings {
  children?: { name: string; standings: { entries: EspnStandingEntry[] } }[];
}

export interface EspnStandingEntry {
  team: EspnTeam;
  stats: { name: string; value?: number }[];
}
