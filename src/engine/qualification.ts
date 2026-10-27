// Reparto de los cupos a las copas de la CONMEBOL del año siguiente (art. 27–28 del reglamento LPF 2026).
// Ver docs/REGLAS-2026.md, sección 5.
import type { TeamId } from '../domain/types.ts';

export type LibertadoresRoute = 'libertadores' | 'sudamericana' | 'apertura' | 'clausura' | 'copa-argentina' | 'tabla';

export const ROUTE_NAMES: Record<LibertadoresRoute, string> = {
  libertadores: 'Campeón de la Libertadores',
  sudamericana: 'Campeón de la Sudamericana',
  apertura: 'Campeón del Apertura',
  clausura: 'Campeón del Clausura',
  'copa-argentina': 'Copa Argentina',
  tabla: 'Tabla anual',
};

export interface QualificationInput {
  /** Tabla anual (General) completa, del 1° al último. */
  annual: TeamId[];
  /** Descendidos: no pueden jugar copas internacionales (art. 28.2). */
  relegated: Set<TeamId>;
  aperturaChampion?: TeamId;
  clausuraChampion?: TeamId;
  /** Equipos de Primera ordenados por cómo les fue en la Copa Argentina: el campeón primero (art. 27.8.1). */
  copaArgentinaRanking: TeamId[];
  /** Campeones argentinos de la Libertadores y la Sudamericana del año: ganan una plaza adicional (art. 27.9–27.10). */
  conmebolChampions: { teamId: TeamId; cup: 'libertadores' | 'sudamericana' }[];
  libertadoresTableSpots: number; // 3
  sudamericanaSpots: number; // 6
}

export interface QualifiedTeam {
  teamId: TeamId;
  route: LibertadoresRoute;
  /** El último que entra por la tabla juega la fase 2 (repechaje); el resto, fase de grupos. */
  playoffRound: boolean;
}

export interface Qualification {
  libertadores: QualifiedTeam[];
  sudamericana: TeamId[];
}

export function allocateCups(input: QualificationInput): Qualification {
  const inPrimera = new Set(input.annual);
  const eligible = (t: TeamId | undefined): t is TeamId => t !== undefined && inPrimera.has(t) && !input.relegated.has(t);
  const libertadores: QualifiedTeam[] = [];
  const has = (t: TeamId) => libertadores.some((q) => q.teamId === t);
  const add = (teamId: TeamId, route: LibertadoresRoute) => libertadores.push({ teamId, route, playoffRound: false });

  // Plazas adicionales de los campeones de la CONMEBOL: si ya tenían otro cupo, ese cupo se reasigna más abajo.
  for (const c of input.conmebolChampions) if (inPrimera.has(c.teamId) && !has(c.teamId)) add(c.teamId, c.cup);

  // Argentina 1 y 2: campeones del Apertura y el Clausura. Si no pueden usarlo (ya clasificado, descendido),
  // el cupo pasa a la tabla anual (art. 27.7, 28.2).
  let tableSpots = input.libertadoresTableSpots;
  for (const [champion, route] of [
    [input.aperturaChampion, 'apertura'],
    [input.clausuraChampion, 'clausura'],
  ] as const) {
    if (eligible(champion) && !has(champion)) add(champion, route);
    else tableSpots++;
  }

  // Argentina 3: el cupo es siempre de la Copa Argentina; si el campeón no puede usarlo, pasa al siguiente mejor ubicado (art. 27.8).
  const copa = input.copaArgentinaRanking.find((t) => eligible(t) && !has(t));
  if (copa) add(copa, 'copa-argentina');

  // Argentina 4, 5 y 6 (y los cupos que pasaron a la tabla): los mejores de la tabla anual que no clasificaron.
  const table = input.annual.filter((t) => eligible(t) && !has(t)).slice(0, tableSpots);
  for (const t of table) add(t, 'tabla');
  if (table.length > 0) libertadores.at(-1)!.playoffRound = true;

  const sudamericana = input.annual.filter((t) => eligible(t) && !has(t)).slice(0, input.sudamericanaSpots);
  return { libertadores, sudamericana };
}
