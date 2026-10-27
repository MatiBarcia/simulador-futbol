import { isPlayed, type Match, type TeamId } from '../domain/types.ts';

export interface StandingRow {
  teamId: TeamId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Últimos resultados, del más viejo al más nuevo. */
  form: ('W' | 'D' | 'L')[];
}

export interface RankedRow extends StandingRow {
  position: number;
  /** Quedó empatado en todos los criterios que podemos calcular (faltaría fair play o sorteo). */
  unresolvedTie: boolean;
}

/**
 * - `zone`: desempate de zona del Apertura/Clausura (art. 10): puntos, diferencia, goles a favor,
 *   y después mini-torneo entre los empatados (puntos, diferencia, goles), repetido cuantas veces haga falta.
 * - `general`: Tabla General (art. 24): puntos, diferencia, goles a favor. Sin resultado entre ellos.
 */
export type Tiebreak = 'zone' | 'general';

export function tally(matches: Match[], teamIds: Iterable<TeamId>): Map<TeamId, StandingRow> {
  const rows = new Map<TeamId, StandingRow>();
  for (const id of teamIds) {
    rows.set(id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, form: [] });
  }
  // Los partidos vienen ordenados por fecha (así los guarda la ingesta), y eso define el orden de `form`.
  for (const m of matches) {
    if (!isPlayed(m)) continue;
    add(rows.get(m.homeId), m.homeGoals!, m.awayGoals!);
    add(rows.get(m.awayId), m.awayGoals!, m.homeGoals!);
  }
  return rows;
}

function add(row: StandingRow | undefined, gf: number, ga: number) {
  if (!row) return; // equipo fuera del grupo (ej. rival de un interzonal)
  const result = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
  row.played++;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (result === 'W') {
    row.won++;
    row.points += 3;
  } else if (result === 'D') {
    row.drawn++;
    row.points += 1;
  } else row.lost++;
  row.form.push(result);
}

const byMainCriteria = (a: StandingRow, b: StandingRow) =>
  b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor;

/** Tabla ordenada de `teamIds` con los partidos dados (todos los partidos que juegan, incluso contra equipos de otra zona). */
export function computeStandings(matches: Match[], teamIds: TeamId[], tiebreak: Tiebreak, names?: (id: TeamId) => string): RankedRow[] {
  const rows = [...tally(matches, teamIds).values()];
  const ordered = tiebreak === 'zone' ? sortWithHeadToHead(rows, matches) : groupTies(rows.sort(byMainCriteria), byMainCriteria);
  const name = names ?? ((id: TeamId) => id);
  const result: RankedRow[] = [];
  for (const tied of ordered) {
    // Lo que sigue empatado iría a fair play / sorteo: lo ordenamos por nombre para que sea estable.
    tied.sort((a, b) => name(a.teamId).localeCompare(name(b.teamId)));
    for (const row of tied) result.push({ ...row, position: result.length + 1, unresolvedTie: tied.length > 1 });
  }
  return result;
}

/** Ordena y devuelve bloques de equipos que siguen empatados. */
function sortWithHeadToHead(rows: StandingRow[], matches: Match[]): StandingRow[][] {
  const blocks = groupTies([...rows].sort(byMainCriteria), byMainCriteria);
  return blocks.flatMap((block) => (block.length > 1 ? miniLeague(block, matches) : [block]));
}

function miniLeague(block: StandingRow[], matches: Match[]): StandingRow[][] {
  const ids = new Set(block.map((r) => r.teamId));
  const between = matches.filter((m) => ids.has(m.homeId) && ids.has(m.awayId));
  const h2h = tally(between, ids);
  const cmp = (a: StandingRow, b: StandingRow) => byMainCriteria(h2h.get(a.teamId)!, h2h.get(b.teamId)!);
  const sub = groupTies([...block].sort(cmp), cmp);
  // Si el mini-torneo no separó a nadie, no hay más criterios que podamos aplicar.
  if (sub.length === 1) return sub;
  // Se repite con cada subgrupo que sigue empatado.
  return sub.flatMap((s) => (s.length > 1 ? miniLeague(s, matches) : [s]));
}

function groupTies<T>(sorted: T[], cmp: (a: T, b: T) => number): T[][] {
  const blocks: T[][] = [];
  for (const row of sorted) {
    const last = blocks.at(-1);
    if (last && cmp(last[0], row) === 0) last.push(row);
    else blocks.push([row]);
  }
  return blocks;
}
