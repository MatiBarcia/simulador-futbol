import type { Match, TeamId } from '../domain/types.ts';
import { tally } from './standings.ts';

export interface PromedioRow {
  teamId: TeamId;
  /** Puntos y partidos por temporada. Sin entrada = no jugó en Primera esa temporada. */
  bySeason: Record<number, { points: number; played: number }>;
  points: number;
  played: number;
  /** Puntos / partidos, sin truncar. */
  average: number;
  position: number;
  /** Mismo promedio (con los decimales oficiales) que el de arriba o el de abajo. */
  tied: boolean;
}

export interface SeasonMatches {
  season: number;
  matches: Match[];
}

/**
 * Tabla de promedios: puntos / partidos jugados en Primera durante `seasons`.
 * Un equipo que no jugó alguna de esas temporadas en Primera promedia solo las que jugó.
 * Equipos sin partidos (ej. recién ascendidos antes de debutar) no se incluyen.
 */
export function computePromedios(
  data: SeasonMatches[],
  teamIds: TeamId[],
  seasons: number[],
  counts: (m: Match) => boolean,
  decimals: number,
): PromedioRow[] {
  const rows: PromedioRow[] = teamIds.map((teamId) => ({ teamId, bySeason: {}, points: 0, played: 0, average: 0, position: 0, tied: false }));
  for (const { season, matches } of data) {
    if (!seasons.includes(season)) continue;
    const table = tally(matches.filter(counts), teamIds);
    for (const row of rows) {
      const t = table.get(row.teamId)!;
      if (t.played === 0) continue;
      row.bySeason[season] = { points: t.points, played: t.played };
      row.points += t.points;
      row.played += t.played;
    }
  }
  const withGames = rows.filter((r) => r.played > 0);
  for (const r of withGames) r.average = r.points / r.played;
  withGames.sort((a, b) => b.average - a.average || b.points - a.points);
  const shown = withGames.map((r) => truncate(r.average, decimals));
  withGames.forEach((r, i) => {
    r.position = i + 1;
    r.tied = shown[i] === shown[i - 1] || shown[i] === shown[i + 1];
  });
  return withGames;
}

/** 1.0989 → "1.098". Así se publican (y comparan) los promedios. */
export function truncate(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  // El épsilon evita que 1.2 * 1000 = 1199.9999 se trunque a 1.199.
  return (Math.floor(value * factor + 1e-9) / factor).toFixed(decimals);
}
