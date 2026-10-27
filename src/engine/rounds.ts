import type { Match } from '../domain/types.ts';

/**
 * Asigna el número de fecha a los partidos de la fase regular cuando el proveedor no lo da.
 * En orden cronológico, cada partido va a la primera fecha en la que ninguno de los dos equipos jugó todavía.
 * Un partido postergado cae solo en el hueco que dejó en su fecha original.
 */
export function inferRounds(matches: Match[]): Match[] {
  const used = new Map<string, Set<number>>(); // `${torneo}|${equipo}` → fechas ocupadas
  const rounds = new Map<string, number>();
  const regular = matches
    .filter((m) => m.phase === 'regular' && m.round === undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const m of regular) {
    const home = getOrCreate(used, `${m.tournamentId}|${m.homeId}`);
    const away = getOrCreate(used, `${m.tournamentId}|${m.awayId}`);
    let round = 1;
    while (home.has(round) || away.has(round)) round++;
    home.add(round);
    away.add(round);
    rounds.set(m.id, round);
  }
  return matches.map((m) => (rounds.has(m.id) ? { ...m, round: rounds.get(m.id) } : m));
}

function getOrCreate(map: Map<string, Set<number>>, key: string) {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  return set;
}
