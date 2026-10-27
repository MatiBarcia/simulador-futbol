// Resultados de la simulación calculados en la nube (scripts/precompute.ts), para que el dispositivo no tenga que simular.
// Los escenarios crudos pesan decenas de MB; acá va solo lo que muestra la página: probabilidades y el análisis por equipo.
import type { Match, SeasonData, TeamId } from '../domain/types.ts';
import { fnv1a } from './hash.ts';
import { analyzeGoal, type EventEffect, type Goal, type GoalAnalysis } from './analysis.ts';
import type { SimEvent, SimulationResult, TeamOdds } from './simulate.ts';

export const GOALS: Goal[] = ['libertadores', 'sudamericana', 'playoffs', 'champion', 'safe'];

type SerializedEffect = Omit<EventEffect, 'event'>;

interface SerializedAnalysis extends Omit<GoalAnalysis, 'ownMatches' | 'helpers' | 'path'> {
  ownMatches: SerializedEffect[];
  helpers: SerializedEffect[];
  path?: { steps: { index: number; value: number }[]; probability: number };
}

export interface PrecomputedSimulation {
  version: 1;
  generatedAt: string;
  /** Huella de los datos con los que se simuló: si no coincide con los datos actuales, está desactualizado. */
  basedOn: string;
  iterations: number;
  tournamentId: string;
  simulatedMatches: number;
  teams: TeamOdds[];
  events: SimEvent[];
  allTeams: TeamId[];
  analyses: Record<TeamId, Partial<Record<Goal, SerializedAnalysis>>>;
}

/** Cuántos "le conviene que…" se guardan por equipo y objetivo (la página muestra 6). */
const MAX_HELPERS = 8;

export function precompute(result: SimulationResult, basedOn: string): PrecomputedSimulation {
  const analyses: PrecomputedSimulation['analyses'] = {};
  for (const teamId of result.samples.teams) {
    analyses[teamId] = {};
    for (const goal of GOALS) {
      const a = analyzeGoal(result.samples, teamId, goal);
      const strip = ({ event: _event, ...rest }: EventEffect): SerializedEffect => rest;
      analyses[teamId][goal] = {
        ...a,
        ownMatches: a.ownMatches.map(strip),
        helpers: a.helpers.slice(0, MAX_HELPERS).map(strip),
        path: a.path && { probability: a.path.probability, steps: a.path.steps.map((s) => ({ index: s.effect.index, value: s.value })) },
      };
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    basedOn,
    iterations: result.iterations,
    tournamentId: result.tournamentId,
    simulatedMatches: result.simulatedMatches,
    teams: result.teams,
    events: result.samples.events,
    allTeams: result.samples.allTeams,
    analyses,
  };
}

/** Vuelve a armar el análisis con los eventos completos. */
export function hydrateAnalysis(pre: PrecomputedSimulation, teamId: TeamId, goal: Goal): GoalAnalysis | undefined {
  const a = pre.analyses[teamId]?.[goal];
  if (!a) return undefined;
  const effect = (e: SerializedEffect): EventEffect => ({ ...e, event: pre.events[e.index] });
  const helpers = a.helpers.map(effect);
  const ownMatches = a.ownMatches.map(effect);
  const byIndex = new Map([...helpers, ...ownMatches].map((e) => [e.index, e]));
  return {
    ...a,
    ownMatches,
    helpers,
    path: a.path && {
      probability: a.path.probability,
      steps: a.path.steps.map((s) => ({ effect: byIndex.get(s.index) ?? { index: s.index, event: pre.events[s.index], outcomes: [], best: { value: s.value, frequency: 0, probability: 0 }, influence: 0 }, value: s.value })),
    },
  };
}

/**
 * Huella de lo que afecta a la simulación: los partidos y sus resultados finales. No cambia con el minuto de un partido en juego
 * (los partidos en juego se simulan desde cero), así no se recalcula de más.
 */
export function simulationInputHash(seasons: SeasonData[], cups: SeasonData[]): string {
  const key = (m: Match) =>
    [m.id, m.date, m.homeId, m.awayId, m.status === 'finished' ? `${m.homeGoals}-${m.awayGoals}-${m.penalties?.home ?? ''}-${m.penalties?.away ?? ''}` : m.status === 'cancelled' ? 'x' : '-'].join('|');
  const text = [...seasons, ...cups]
    .map((s) => `${s.competition}/${s.season}:` + s.matches.map(key).sort().join(';'))
    .sort()
    .join('\n');
  return fnv1a(text);
}
