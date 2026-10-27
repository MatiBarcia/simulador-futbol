// Copas de eliminación directa (Copa Argentina, finales de la CONMEBOL): completar lo que falta y ver hasta dónde llegó cada uno.
import type { Match, Phase, TeamId } from '../domain/types.ts';
import { matchWinner } from './bracket.ts';

export const KNOCKOUT_PHASES: Phase[] = ['round-of-64', 'round-of-32', 'round-of-16', 'quarterfinals', 'semifinals', 'final'];
const CHAMPION = KNOCKOUT_PHASES.length;

/**
 * Hasta qué ronda llegó cada equipo (índice en KNOCKOUT_PHASES; el campeón tiene KNOCKOUT_PHASES.length).
 * Un equipo que todavía no quedó eliminado figura en la última ronda que jugó o tiene programada.
 */
export function cupProgress(matches: Match[]): { champion?: TeamId; runnerUp?: TeamId; reached: Map<TeamId, number> } {
  const reached = new Map<TeamId, number>();
  for (const m of matches) {
    const i = KNOCKOUT_PHASES.indexOf(m.phase);
    for (const t of [m.homeId, m.awayId]) reached.set(t, Math.max(reached.get(t) ?? -1, i));
  }
  const final = matches.find((m) => m.phase === 'final');
  const champion = final && matchWinner(final);
  if (!final || !champion) return { reached };
  reached.set(champion, CHAMPION);
  return { champion, runnerUp: champion === final.homeId ? final.awayId : final.homeId, reached };
}

/**
 * Juega todo lo que falta de una copa con `play` (que siempre tiene que dar un ganador).
 * Si una ronda todavía no tiene los cruces cargados, los ganadores de la anterior se cruzan en orden de fecha
 * (es una aproximación: el cuadro real no viene en los datos).
 */
export function completeCup(matches: Match[], play: (home: TeamId, away: TeamId, phase: Phase) => Match): Match[] {
  const result = matches.map((m) => (matchWinner(m) || m.status === 'cancelled' ? m : play(m.homeId, m.awayId, m.phase)));
  const phases = KNOCKOUT_PHASES.filter((p) => result.some((m) => m.phase === p));
  let phase = phases.at(-1);
  while (phase && phase !== 'final') {
    const next = KNOCKOUT_PHASES[KNOCKOUT_PHASES.indexOf(phase) + 1];
    const already = new Set(result.filter((m) => m.phase === next).flatMap((m) => [m.homeId, m.awayId]));
    const winners = result
      .filter((m) => m.phase === phase)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => matchWinner(m)!)
      .filter((t) => !already.has(t));
    for (let i = 0; i + 1 < winners.length; i += 2) result.push(play(winners[i], winners[i + 1], next));
    phase = next;
  }
  return result;
}
