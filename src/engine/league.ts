// Arma todas las tablas de una temporada de la LPF a partir de los datos crudos. Sin React.
import type { SeasonData, TeamId } from '../domain/types.ts';
import { promediosRules, seasonRules } from '../rules/lpf.ts';
import { computePromedios, type PromedioRow } from './promedios.ts';
import { computeStandings, type RankedRow } from './standings.ts';

export interface ZoneTable {
  group: string;
  rows: RankedRow[];
  /** Equipos que hoy entrarían a los playoffs. */
  playoffs: Set<TeamId>;
}

export interface LeagueView {
  season: number;
  zones: Record<string, ZoneTable[]>; // por torneo
  annual: RankedRow[];
  promedios: PromedioRow[];
  /** Promedios del año que viene: solo las 2 temporadas que siguen contando (N-1 y N). */
  nextPromedios: PromedioRow[];
  /** Quién desciende si el torneo terminara hoy. */
  relegated: { byPromedio: TeamId[]; byAnnualTable: TeamId[] };
}

export function buildLeagueView(seasons: SeasonData[], season: number): LeagueView {
  const current = seasons.find((s) => s.season === season);
  if (!current) throw new Error(`Falta la temporada ${season}`);
  const rules = seasonRules(season);
  const teamIds = current.teams.map((t) => t.id);
  const nameOf = (id: TeamId) => current.teams.find((t) => t.id === id)?.name ?? id;

  const annualMatches = current.matches.filter((m) => m.phase === 'regular' && rules.annualTournaments.includes(m.tournamentId));
  const annual = computeStandings(annualMatches, teamIds, 'general', nameOf);

  const data = seasons.map((s) => ({ season: s.season, matches: s.matches }));
  const p = promediosRules(season);
  const promedios = computePromedios(data, teamIds, p.seasons, p.counts, p.decimals);
  const pNext = promediosRules(season + 1);
  const nextPromedios = computePromedios(data, teamIds, pNext.seasons, pNext.counts, pNext.decimals);

  const byPromedio = promedios.slice(-rules.relegation.byPromedio).map((r) => r.teamId);
  const byAnnualTable = annual
    .filter((r) => !byPromedio.includes(r.teamId))
    .slice(-rules.relegation.byAnnualTable)
    .map((r) => r.teamId);
  const relegatedNow = new Set([...byPromedio, ...byAnnualTable]);

  const zones: Record<string, ZoneTable[]> = {};
  for (const tournament of current.tournaments) {
    if (!tournament.groups || !rules.zoneTournaments.includes(tournament.id)) continue;
    const matches = current.matches.filter((m) => m.tournamentId === tournament.id && m.phase === 'regular');
    if (matches.length === 0) continue;
    const skipRelegated = rules.relegatedSkipPlayoffs.includes(tournament.id);
    zones[tournament.id] = Object.entries(tournament.groups).map(([group, ids]) => {
      const rows = computeStandings(matches, ids, 'zone', nameOf);
      const eligible = rows.filter((r) => !(skipRelegated && relegatedNow.has(r.teamId)));
      return { group, rows, playoffs: new Set(eligible.slice(0, rules.playoffSpotsPerZone).map((r) => r.teamId)) };
    });
  }

  return { season, zones, annual, promedios, nextPromedios, relegated: { byPromedio, byAnnualTable } };
}
