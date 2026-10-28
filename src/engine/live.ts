// Resultados del día: qué partidos hay que volver a consultar y cómo se mezclan con los datos publicados.
// Los datos publicados (data/*.json) se actualizan cada algunos minutos; esto los completa con lo que pasó después.
import type { CompetitionId, Match, SeasonData } from '../domain/types.ts';

/** Un partido que empieza dentro de este margen ya se consulta (por si cambia el horario o arranca antes). */
const BEFORE_KICKOFF_MS = 10 * 60_000;
/** Un partido sin terminar de hace más que esto se da por postergado o suspendido: no se consulta más. */
const STALE_AFTER_MS = 2 * 24 * 3600_000;

/** Día `YYYYMMDD` de una fecha en una zona horaria. */
const dayIn = (date: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(date).replaceAll('-', '');

/** Partidos que pueden haber cambiado: en juego, por empezar, o que ya deberían haber terminado y no figuran terminados. */
export function pendingNow(matches: Match[], now: Date): Match[] {
  const t = now.getTime();
  return matches.filter((m) => {
    if (m.status === 'finished' || m.status === 'cancelled') return false;
    const kickoff = Date.parse(m.date);
    return kickoff - BEFORE_KICKOFF_MS <= t && t - kickoff <= STALE_AFTER_MS;
  });
}

/** Qué días hay que consultar de cada competencia. Vacío = no hay nada en juego ni por empezar. */
export function daysToCheck(data: SeasonData[], now: Date): { competition: CompetitionId; season: number; days: string[] }[] {
  return data.flatMap((s) => {
    const pending = pendingNow(s.matches, now);
    // No está claro en qué zona horaria cuenta los días ESPN: se piden el de Argentina y el de Nueva York (casi siempre son el mismo).
    const days = [...new Set(pending.flatMap((m) => [dayIn(new Date(m.date), 'America/Argentina/Buenos_Aires'), dayIn(new Date(m.date), 'America/New_York')]))];
    return days.length ? [{ competition: s.competition, season: s.season, days: days.sort() }] : [];
  });
}

/**
 * Aplica los partidos recién consultados sobre los publicados: estado, goles, penales, minuto y horario.
 * Solo se actualizan partidos que ya están en los datos (los nuevos llegan con la próxima publicación).
 * Devuelve el mismo objeto si nada cambió, para no recalcular las tablas de más.
 */
export function applyLive(season: SeasonData, fresh: ReadonlyMap<string, Match>): SeasonData {
  let changed = false;
  const matches = season.matches.map((m) => {
    const f = fresh.get(m.id);
    if (!f || !isNewer(m, f) || sameResult(m, f)) return m;
    changed = true;
    return { ...m, date: f.date, status: f.status, homeGoals: f.homeGoals, awayGoals: f.awayGoals, penalties: f.penalties, clock: f.clock };
  });
  return changed ? { ...season, matches } : season;
}

/** Un partido terminado no vuelve atrás (por si ESPN devuelve algo viejo de caché). */
const isNewer = (published: Match, fresh: Match) => !(published.status === 'finished' && fresh.status !== 'finished');

const sameResult = (a: Match, b: Match) =>
  a.date === b.date &&
  a.status === b.status &&
  a.homeGoals === b.homeGoals &&
  a.awayGoals === b.awayGoals &&
  a.penalties?.home === b.penalties?.home &&
  a.penalties?.away === b.penalties?.away &&
  a.clock === b.clock;
