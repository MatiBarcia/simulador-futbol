// "¿Qué necesita mi equipo?": a partir de los escenarios simulados, qué resultados le convienen a un equipo para un objetivo.
import type { TeamId } from '../domain/types.ts';
import type { ExactAnswer } from './exact.ts';
import type { LibertadoresRoute } from './qualification.ts';
import { AWAY, DRAW, HOME, objectiveBit, ROUTES, type Objective, type SimEvent, type SimulationSamples } from './simulate.ts';

/** Objetivos que puede elegir el usuario. `safe` = no descender. */
export type Goal = 'libertadores' | 'sudamericana' | 'playoffs' | 'champion' | 'safe';

export interface OutcomeEffect {
  /** HOME / DRAW / AWAY en un partido, o índice del equipo campeón. */
  value: number;
  /** Qué tan seguido pasa este resultado en las simulaciones. */
  frequency: number;
  /** Probabilidad de cumplir el objetivo si pasa este resultado. */
  probability: number;
}

export interface EventEffect {
  event: SimEvent;
  index: number;
  outcomes: OutcomeEffect[];
  /** El resultado que más le conviene. */
  best: OutcomeEffect;
  /** Diferencia entre el mejor y el peor resultado (con suficientes casos para ser confiable). */
  influence: number;
}

export type GoalStatus = 'done' | 'own-hands' | 'needs-help' | 'out';

export interface GoalAnalysis {
  probability: number;
  status: GoalStatus;
  /** Probabilidad si gana todos sus partidos de liga que faltan (undefined si no pasó en ninguna simulación). */
  ifWinsAll?: number;
  /** Sus propios partidos. */
  ownMatches: EventEffect[];
  /** Otros resultados que lo ayudan, del que más influye al que menos. */
  helpers: EventEffect[];
  /** Un camino: resultados que, si se dan todos, le dan `probability` de lograrlo. */
  path?: { steps: { effect: EventEffect; value: number }[]; probability: number };
  /** Para la Libertadores: por qué vía clasifica, en proporción de las simulaciones. */
  routes: { route: LibertadoresRoute; probability: number }[];
  /** Para elegir resultados de sus propios partidos y ver cómo cambia la chance (sin volver a simular). */
  scenarios?: Scenarios;
  /** Si todavía puede / si ya lo tiene asegurado, calculado de forma exacta (no por simulación). Se agrega en la nube. */
  exact?: ExactAnswer;
}

/**
 * Títulos que no cambian ninguno de los objetivos: el Trofeo de Campeones y la Supercopa Argentina no dan cupos ni definen
 * playoffs o descensos. Se juegan con los que ganaron otra cosa, así que su resultado está correlacionado con el objetivo
 * (ej. ganar el Trofeo casi siempre es porque ganó el Clausura), pero no lo causa: mostrarlos como "si gana X" confunde.
 */
const NOT_CAUSES = new Set(['trofeo', 'supercopa-argentina']);

/**
 * Las simulaciones agrupadas por cómo salieron los partidos de un equipo: para cada combinación de resultados, en cuántas
 * lo logró y cuántas hubo. Con eso la página calcula la chance con los resultados que elige el usuario.
 */
export interface Scenarios {
  /** Índices de los eventos (sus partidos), en el orden de las claves. */
  events: number[];
  /** "0,2" (HOME en el primero, AWAY en el segundo) → [simulaciones en que lo logra, simulaciones con esos resultados]. */
  counts: Record<string, [ok: number, total: number]>;
}

/** Con más partidos, las combinaciones se vuelven demasiadas y quedan pocas simulaciones en cada una. */
const MAX_SCENARIO_EVENTS = 5;

function scenarioCounts(samples: SimulationSamples, events: number[], ok: Uint8Array): Scenarios {
  const nEvents = samples.events.length;
  // Clave numérica en base 4 (los resultados de un partido son 0, 1 o 2): mucho más rápido que armar strings.
  const byKey = new Map<number, [number, number]>();
  for (let it = 0; it < ok.length; it++) {
    let key = 0;
    for (const e of events) key = key * 4 + samples.outcomes[it * nEvents + e];
    let c = byKey.get(key);
    if (!c) byKey.set(key, (c = [0, 0]));
    c[0] += ok[it];
    c[1]++;
  }
  const counts: Scenarios['counts'] = {};
  for (const [key, c] of byKey) {
    const values = events.map((_, i) => Math.floor(key / 4 ** (events.length - 1 - i)) % 4);
    counts[values.join(',')] = c;
  }
  return { events, counts };
}

/** Chance con algunos de sus partidos fijados (índice de evento → resultado); los demás, como salieron en las simulaciones. */
export function conditionalProbability(s: Scenarios, chosen: ReadonlyMap<number, number>): { probability: number; simulations: number } {
  let ok = 0;
  let total = 0;
  for (const [key, [k, n]] of Object.entries(s.counts)) {
    const values = key.split(',').map(Number);
    if (s.events.every((e, i) => !chosen.has(e) || chosen.get(e) === values[i])) {
      ok += k;
      total += n;
    }
  }
  return { probability: total ? ok / total : 0, simulations: total };
}

const MIN_SHARE = 0.01; // un resultado con menos del 1% de los casos no alcanza para sacar conclusiones

export function analyzeGoal(samples: SimulationSamples, teamId: TeamId, goal: Goal): GoalAnalysis {
  const nTeams = samples.teams.length;
  const nEvents = samples.events.length;
  const iterations = samples.objectives.length / nTeams;
  const t = samples.teams.indexOf(teamId);
  const ok = new Uint8Array(iterations);
  let successes = 0;
  for (let it = 0; it < iterations; it++) {
    const bits = samples.objectives[it * nTeams + t];
    const met = goal === 'safe' ? !(bits & objectiveBit('relegated')) : Boolean(bits & objectiveBit(goal as Objective));
    ok[it] = met ? 1 : 0;
    successes += ok[it];
  }
  const probability = successes / iterations;
  const minCount = Math.max(20, iterations * MIN_SHARE);
  // Si ya está decidido (en todas las simulaciones lo logra, o en ninguna) no hay nada que analizar.
  if (probability === 0 || probability === 1) {
    return { probability, status: probability === 1 ? 'done' : 'out', ownMatches: [], helpers: [], routes: routesOf(samples, goal, t) };
  }

  const effects: EventEffect[] = samples.events.flatMap((event, e) => {
    if (NOT_CAUSES.has(event.competition)) return [];
    const count = new Map<number, number>();
    const good = new Map<number, number>();
    for (let it = 0; it < iterations; it++) {
      const v = samples.outcomes[it * nEvents + e];
      count.set(v, (count.get(v) ?? 0) + 1);
      good.set(v, (good.get(v) ?? 0) + ok[it]);
    }
    const outcomes = [...count].map(([value, n]) => ({ value, frequency: n / iterations, probability: good.get(value)! / n }));
    const reliable = outcomes.filter((o) => o.frequency * iterations >= minCount);
    const sorted = [...(reliable.length ? reliable : outcomes)].sort((a, b) => b.probability - a.probability);
    return { event, index: e, outcomes, best: sorted[0], influence: sorted[0].probability - sorted.at(-1)!.probability };
  });

  const involves = (e: SimEvent) => e.kind === 'match' && (e.homeId === teamId || e.awayId === teamId);
  const ownMatches = effects.filter((x) => involves(x.event));
  const scenarios = scenarioCounts(
    samples,
    ownMatches.slice(0, MAX_SCENARIO_EVENTS).map((x) => x.index),
    ok,
  );
  const helpers = effects
    .filter((x) => !involves(x.event) && x.influence >= 0.02)
    .sort((a, b) => b.influence - a.influence);

  // Si gana todos sus partidos de liga.
  const ownLeague = ownMatches.filter((x) => x.event.kind === 'match' && x.event.competition !== 'copa-argentina' && !['libertadores', 'sudamericana'].includes(x.event.competition));
  const winValue = (x: EventEffect) => (x.event.kind === 'match' && x.event.homeId === teamId ? HOME : AWAY);
  let winsAll = 0;
  let winsAllOk = 0;
  for (let it = 0; it < iterations; it++) {
    if (ownLeague.every((x) => samples.outcomes[it * nEvents + x.index] === winValue(x))) {
      winsAll++;
      winsAllOk += ok[it];
    }
  }
  const ifWinsAll = winsAll >= 10 ? winsAllOk / winsAll : undefined;

  // Un camino: se van fijando resultados de a uno (el que más sube la probabilidad entre los escenarios que quedan),
  // hasta que lo logra en casi todos o ya no quedan suficientes escenarios para estar seguros.
  // Primero se busca sin que salga campeón (eso ya se muestra aparte y es obvio); si no hay otra forma, con el título.
  const findPath = (allowOwnTitles: boolean) => {
    let alive: number[] = [];
    for (let it = 0; it < iterations; it++) alive.push(it);
    const steps: { effect: EventEffect; value: number }[] = [];
    let current = probability;
    const minAlive = Math.max(30, iterations * 0.005);
    while (current < 0.99 && steps.length < 8 && probability > 0) {
      let best: { effect: EventEffect; value: number; rate: number; sims: number[] } | undefined;
      for (const x of effects) {
        if (steps.some((st) => st.effect === x)) continue;
        const byValue = new Map<number, number[]>();
        for (const it of alive) {
          const v = samples.outcomes[it * nEvents + x.index];
          let list = byValue.get(v);
          if (!list) byValue.set(v, (list = []));
          list.push(it);
        }
        for (const [value, sims] of byValue) {
          if (sims.length < minAlive) continue;
          if (!allowOwnTitles && x.event.kind === 'champion' && samples.allTeams[value] === teamId) continue;
          const rate = sims.reduce((n, it) => n + ok[it], 0) / sims.length;
          if (!best || rate > best.rate) best = { effect: x, value, rate, sims };
        }
      }
      if (!best || best.rate < current + 0.01) break;
      steps.push({ effect: best.effect, value: best.value });
      alive = best.sims;
      current = best.rate;
    }
    return steps.length ? { steps, probability: current } : undefined;
  };
  const withoutTitle = findPath(false);
  const path = withoutTitle && withoutTitle.probability >= 0.5 ? withoutTitle : (findPath(true) ?? withoutTitle);

  const routes = routesOf(samples, goal, t);

  const status: GoalStatus =
    probability === 1 ? 'done' : probability === 0 ? 'out' : ifWinsAll !== undefined && ifWinsAll === 1 ? 'own-hands' : 'needs-help';
  return { probability, status, ifWinsAll, ownMatches, helpers, path, routes, scenarios };
}

/** Resultado de un partido visto desde un equipo: 'win' | 'draw' | 'loss'. */
export function resultFor(event: SimEvent, value: number, teamId: TeamId): 'win' | 'draw' | 'loss' | undefined {
  if (event.kind !== 'match') return undefined;
  if (value === DRAW) return 'draw';
  const homeWon = value === HOME;
  return (event.homeId === teamId) === homeWon ? 'win' : 'loss';
}

/** Para la Libertadores: por qué vía clasifica, en proporción de las simulaciones. */
function routesOf(samples: SimulationSamples, goal: Goal, t: number): GoalAnalysis['routes'] {
  if (goal !== 'libertadores') return [];
  const nTeams = samples.teams.length;
  const iterations = samples.objectives.length / nTeams;
  const counts = new Map<LibertadoresRoute, number>();
  for (let it = 0; it < iterations; it++) {
    const r = samples.routes[it * nTeams + t];
    if (r) counts.set(ROUTES[r - 1], (counts.get(ROUTES[r - 1]) ?? 0) + 1);
  }
  return [...counts].map(([route, n]) => ({ route, probability: n / iterations })).sort((a, b) => b.probability - a.probability);
}
