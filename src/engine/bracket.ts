// Llave de playoffs del Apertura/Clausura: partidos reales donde los hay, y el resto proyectado desde la tabla.
import type { Match, Phase, TeamId } from '../domain/types.ts';
import { PLAYOFF_BRACKET_R16, type Seed } from '../rules/lpf.ts';
import type { ZoneTable } from './league.ts';

export interface BracketSlot {
  /** Equipos en el orden en que se dibujan (arriba / abajo). Sin definir = depende de un partido anterior. */
  teams: [TeamId | undefined, TeamId | undefined];
  /** Posición de la fase de zonas (solo en octavos): "1A", "8B". */
  seeds?: [string, string];
  match?: Match;
  winner?: TeamId;
}

export interface BracketRound {
  phase: Exclude<Phase, 'regular'>;
  slots: BracketSlot[];
}

const ROUNDS: BracketRound['phase'][] = ['round-of-16', 'quarterfinals', 'semifinals', 'final'];

export function matchWinner(m: Match): TeamId | undefined {
  if (m.status !== 'finished' || m.homeGoals === undefined || m.awayGoals === undefined) return undefined;
  if (m.homeGoals !== m.awayGoals) return m.homeGoals > m.awayGoals ? m.homeId : m.awayId;
  if (m.penalties) return m.penalties.home > m.penalties.away ? m.homeId : m.awayId;
  return undefined;
}

/** Goles de `teamId` en el partido (y penales, si hubo). */
export function goalsOf(m: Match, teamId: TeamId): { goals?: number; penalties?: number } {
  const home = m.homeId === teamId;
  return {
    goals: home ? m.homeGoals : m.awayGoals,
    penalties: m.penalties ? (home ? m.penalties.home : m.penalties.away) : undefined,
  };
}

/**
 * Arma la llave. Los octavos salen de las posiciones de cada zona (solo equipos habilitados para los playoffs);
 * las rondas siguientes, de los ganadores. Si un partido real no coincide con la proyección (ej. un desempate por
 * fair play que no podemos calcular), manda el partido real.
 */
export function buildBracket(zones: ZoneTable[], playoffMatches: Match[]): BracketRound[] {
  const seedTeam = ([group, pos]: Seed) => {
    const zone = zones.find((z) => z.group === group);
    return zone?.rows.filter((r) => zone.playoffs.has(r.teamId))[pos - 1]?.teamId;
  };
  const byPhase = (phase: Phase) => playoffMatches.filter((m) => m.phase === phase);
  const involves = (m: Match, id: TeamId | undefined) => id !== undefined && (m.homeId === id || m.awayId === id);

  const rounds: BracketRound[] = [];
  let previous: BracketSlot[] | undefined;
  for (const phase of ROUNDS) {
    const unused = [...byPhase(phase)];
    const slots: BracketSlot[] = previous
      ? pairs(previous).map(([a, b]) => ({ teams: [a.winner, b.winner] }))
      : PLAYOFF_BRACKET_R16.map(([s1, s2]) => ({ teams: [seedTeam(s1), seedTeam(s2)], seeds: [s1[1] + s1[0], s2[1] + s2[0]] }));

    // Primero, los partidos que coinciden con lo esperado.
    for (const slot of slots) {
      const i = unused.findIndex((m) => involves(m, slot.teams[0]) || involves(m, slot.teams[1]));
      if (i >= 0) slot.match = unused.splice(i, 1)[0];
    }
    // Después, los que no coincidieron, en los lugares que quedaron libres.
    for (const slot of slots) if (!slot.match && unused.length) slot.match = unused.shift();

    for (const slot of slots) {
      const m = slot.match;
      if (!m) continue;
      // Respetamos el orden de la llave: si el de arriba es el visitante, lo dejamos arriba igual.
      const top = involves(m, slot.teams[0]) ? slot.teams[0]! : involves(m, slot.teams[1]) ? (m.homeId === slot.teams[1] ? m.awayId : m.homeId) : m.homeId;
      const teams: BracketSlot['teams'] = [top, top === m.homeId ? m.awayId : m.homeId];
      if (teams[0] !== slot.teams[0] || teams[1] !== slot.teams[1]) slot.seeds = undefined; // la proyección no coincidió
      slot.teams = teams;
      slot.winner = matchWinner(m);
    }
    rounds.push({ phase, slots });
    previous = slots;
  }
  return rounds;
}

function pairs<T>(items: T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < items.length; i += 2) result.push([items[i], items[i + 1]]);
  return result;
}
