// Monte Carlo del resto de la temporada: completa los partidos que faltan (o usa los resultados que fijó el usuario),
// define descensos, playoffs, campeones y cupos a copas, y guarda cada escenario para poder analizarlo después.
import type { Match, Phase, SeasonData, TeamId } from '../domain/types.ts';
import { knownTitle, promediosRules, qualificationRules, seasonRules } from '../rules/lpf.ts';
import { buildBracket, matchWinner } from './bracket.ts';
import { completeCup, cupProgress } from './cups.ts';
import type { ZoneTable } from './league.ts';
import { DEFAULT_FIT, expectedGoals, fitRatings, MAX_GOALS, scoreGrid, type Ratings } from './model.ts';
import { computePromedios, seasonTotals, truncate } from './promedios.ts';
import { allocateCups, type LibertadoresRoute } from './qualification.ts';
import { computeStandings, type RankedRow } from './standings.ts';
import { recopaTeams, supercopaArgentinaTeams, supercopaInternacionalTeams, trofeoPlan, type Finalists } from './titles.ts';

export type FixedResults = Record<string, { home: number; away: number }>;

export interface SimulationInput {
  seasons: SeasonData[];
  season: number;
  /** Copas de la temporada (Copa Argentina, Libertadores, Sudamericana, Supercopa Argentina). */
  cups: SeasonData[];
  /** Resultados que fija el usuario, por id de partido. */
  fixed: FixedResults;
  iterations: number;
  seed?: number;
}

/**
 * Lo que puede querer (o no querer) un equipo. Cada uno es un bit en `SimulationSamples.objectives`.
 * - Títulos de la temporada: champion (torneo en curso), leagueChampion, trofeo, copaArgentina, supercopaArgentina.
 * - Clasificación: playoffs (del torneo en curso), libertadores y sudamericana (del año que viene),
 *   superArg (Supercopa Argentina), superInt (Supercopa Internacional) y recopa (Recopa de Campeones) del año que viene.
 */
export const OBJECTIVES = [
  'playoffs',
  'champion',
  'leagueChampion',
  'relegated',
  'libertadores',
  'sudamericana',
  'trofeo',
  'copaArgentina',
  'supercopaArgentina',
  'superArg',
  'superInt',
  'recopa',
] as const;
export type Objective = (typeof OBJECTIVES)[number];
export const objectiveBit = (o: Objective) => 1 << OBJECTIVES.indexOf(o);

export const ROUTES: LibertadoresRoute[] = ['libertadores', 'sudamericana', 'apertura', 'clausura', 'copa-argentina', 'tabla'];

/** Algo que se define en lo que falta: un partido, o quién sale campeón de algo. */
export type SimEvent =
  | { kind: 'match'; id: string; competition: string; phase: Phase; round?: number; date: string; homeId: TeamId; awayId: TeamId }
  | { kind: 'champion'; competition: string };

/** Resultado de un partido en un escenario: 0 = gana el local, 1 = empate, 2 = gana el visitante. */
export const HOME = 0;
export const DRAW = 1;
export const AWAY = 2;

export interface SimulationSamples {
  events: SimEvent[];
  /** outcomes[sim * events.length + e]: HOME/DRAW/AWAY para partidos; índice en `allTeams` para campeones. */
  outcomes: Uint16Array;
  /** Equipos de la liga, en el orden de `objectives` y `routes`. */
  teams: TeamId[];
  /** Todos los equipos que aparecen (incluye los de otras categorías y países, por los campeones de copas). */
  allTeams: TeamId[];
  /** objectives[sim * teams.length + t]: bits de OBJECTIVES que se cumplieron. */
  objectives: Uint16Array;
  /** routes[sim * teams.length + t]: 1 + índice en ROUTES por el que clasificó a la Libertadores (0 = no clasificó). */
  routes: Uint8Array;
}

/** Probabilidades de un equipo: una por cada objetivo, más la distribución de su posición final en la zona. */
export type TeamOdds = {
  teamId: TeamId;
  group: string;
  /** positions[i] = probabilidad de terminar (i+1)° en su zona. */
  positions: number[];
  expectedPoints: number;
  relegatedByPromedio: number;
  relegatedByAnnual: number;
} & Record<Objective, number>;

export interface SimulationResult {
  iterations: number;
  tournamentId: string;
  /** Partidos de liga que se simularon (los que faltan, menos los fijados). */
  simulatedMatches: number;
  teams: TeamOdds[];
  samples: SimulationSamples;
}

/** Partidos de fase regular que todavía no se jugaron, ya con los resultados fijados por el usuario aplicados. */
export function applyFixed(matches: Match[], fixed: FixedResults): Match[] {
  return matches.map((m) => {
    const f = fixed[m.id];
    if (!f || m.status === 'finished' || m.phase !== 'regular') return m;
    return { ...m, status: 'finished', homeGoals: f.home, awayGoals: f.away };
  });
}

/** El torneo que se está jugando: el último torneo con zonas que tiene partidos. */
export function currentTournament(season: SeasonData): string | undefined {
  const rules = seasonRules(season.season);
  return rules.zoneTournaments.filter((t) => season.matches.some((m) => m.tournamentId === t)).at(-1);
}

/** Un equipo sin datos en el modelo: cuenta como promedio. */
const NEUTRAL_TEAM = '';

const isPending = (m: Match) => m.status !== 'finished' && m.status !== 'cancelled';

/** Corre `input.iterations` simulaciones de una vez. */
export function simulate(input: SimulationInput): SimulationResult {
  return createSimulation(input).run(input.iterations);
}

/**
 * Prepara todo lo que no cambia entre simulaciones (modelo, partidos, eventos) una sola vez. Después `run` se puede
 * llamar varias veces para sumar tandas: así la página muestra un resultado rápido y lo va afinando.
 */
export function createSimulation(input: Omit<SimulationInput, 'iterations'>): { run: (iterations: number) => SimulationResult } {
  const rng = mulberry32(input.seed ?? Date.now());
  const current = input.seasons.find((s) => s.season === input.season)!;
  const rules = seasonRules(input.season);
  const tournamentId = currentTournament(current)!;
  const tournament = current.tournaments.find((t) => t.id === tournamentId)!;
  const groups = tournament.groups ?? { '': current.teams.map((t) => t.id) };
  const teamIds = current.teams.map((t) => t.id);
  const teamIndex = new Map(teamIds.map((t, i) => [t, i]));

  // El modelo se ajusta con la liga y la Copa Argentina. Los partidos de la CONMEBOL no: los rivales de otros países
  // juegan muy pocos partidos contra equipos argentinos como para medirlos en la misma escala.
  const allMatches = [...input.seasons, ...input.cups.filter((c) => c.competition === 'copa-argentina')].flatMap((s) => s.matches);
  // El modelo se ajusta a la fecha del último partido jugado (así el resultado no depende de cuándo se corre).
  const lastPlayed = allMatches.filter((m) => m.status === 'finished').reduce((max, m) => (m.date > max ? m.date : max), '');
  const ratings = fitRatings(allMatches, { ...DEFAULT_FIT, asOf: lastPlayed });
  const sampler = new ScoreSampler(ratings, rng);

  const seasonMatches = applyFixed(current.matches, input.fixed);
  const isAnnual = (m: Match) => m.phase === 'regular' && rules.annualTournaments.includes(m.tournamentId);
  const pending = seasonMatches.filter((m) => isAnnual(m) && isPending(m));
  const finishedRegular = seasonMatches.filter((m) => isAnnual(m) && m.status === 'finished');
  const realPlayoffs = seasonMatches.filter((m) => m.tournamentId === tournamentId && m.phase !== 'regular');

  // Finalistas de torneos ya terminados (ej. el Apertura cuando se juega el Clausura).
  const finishedFinalists = new Map<string, Finalists>();
  for (const t of rules.zoneTournaments) {
    if (t === tournamentId) continue;
    const final = current.matches.find((m) => m.tournamentId === t && m.phase === 'final');
    const winner = final && matchWinner(final);
    if (winner) finishedFinalists.set(t, { champion: winner, runnerUp: winner === final.homeId ? final.awayId : final.homeId });
  }
  const supercopaInternacional = knownTitle(input.season, 'supercopaInternacional');

  const p = promediosRules(input.season);
  const q = qualificationRules(input.season);
  // Las temporadas anteriores no cambian: se suman una sola vez.
  const otherSeasons = input.seasons
    .filter((s) => s.season !== input.season && p.seasons.includes(s.season))
    .map((s) => ({ season: s.season, totals: seasonTotals(s.matches, teamIds, p.counts) }));

  const cup = (id: string) => input.cups.find((c) => c.competition === id)?.matches ?? [];

  // Eventos que se registran en cada escenario.
  const events: SimEvent[] = [
    ...pending.map((m): SimEvent => ({ kind: 'match', id: m.id, competition: m.tournamentId, phase: m.phase, round: m.round, date: m.date, homeId: m.homeId, awayId: m.awayId })),
    ...['copa-argentina', 'libertadores', 'sudamericana', 'supercopa-argentina'].flatMap((c) =>
      cup(c)
        .filter(isPending)
        .map((m): SimEvent => ({ kind: 'match', id: m.id, competition: c, phase: m.phase, date: m.date, homeId: m.homeId, awayId: m.awayId })),
    ),
  ];
  // Quién sale campeón, salvo cuando la final ya está programada (ahí el partido de la final dice lo mismo).
  for (const c of [tournamentId, 'trofeo', 'copa-argentina', 'libertadores', 'sudamericana', 'supercopa-argentina']) {
    if (!events.some((e) => e.kind === 'match' && e.competition === c && e.phase === 'final')) events.push({ kind: 'champion', competition: c });
  }
  const eventIndex = new Map(events.map((e, i) => [e.kind === 'match' ? e.id : `champion:${e.competition}`, i]));
  const allTeams = [...new Set([...teamIds, ...input.cups.flatMap((c) => c.teams.map((t) => t.id))])];
  const allTeamIndex = new Map(allTeams.map((t, i) => [t, i]));

  const run = (iterations: number): SimulationResult => {
    const samples: SimulationSamples = {
      events,
      outcomes: new Uint16Array(iterations * events.length),
      teams: teamIds,
      allTeams,
      objectives: new Uint16Array(iterations * teamIds.length),
      routes: new Uint8Array(iterations * teamIds.length),
    };

    // Lo que no es un objetivo (posición, puntos, por qué tabla desciende). Los objetivos se cuentan al final, con los bits.
    const counts = new Map<TeamId, { group: string; positions: number[]; expectedPoints: number; relegatedByPromedio: number; relegatedByAnnual: number }>();
    for (const [group, ids] of Object.entries(groups)) {
      for (const id of ids) counts.set(id, { group, positions: ids.map(() => 0), expectedPoints: 0, relegatedByPromedio: 0, relegatedByAnnual: 0 });
    }

    for (let it = 0; it < iterations; it++) {
      const outcome = (key: string, value: number) => {
        const e = eventIndex.get(key);
        if (e !== undefined) samples.outcomes[it * events.length + e] = value;
      };
      const objective = (team: TeamId, o: Objective) => {
        const t = teamIndex.get(team);
        if (t !== undefined) samples.objectives[it * teamIds.length + t] |= objectiveBit(o);
      };
      // Lo que sigue empatado después de todos los criterios va a fair play / sorteo: acá, al azar.
      const tieOrder = new Map(teamIds.map((t) => [t, rng().toFixed(8)]));
      const tieName = (id: TeamId) => tieOrder.get(id) ?? id;

      const simulated: Match[] = pending.map((m) => {
        const [h, a] = sampler.sample(m.homeId, m.awayId, false);
        outcome(m.id, h > a ? HOME : h === a ? DRAW : AWAY);
        return { ...m, status: 'finished', homeGoals: h, awayGoals: a };
      });
      const regular = [...finishedRegular, ...simulated];

      // Descensos: el último de promedios y el último de la anual sin contar a ese. Empate = partido de desempate.
      const annual = computeStandings(regular, teamIds, 'general', tieName);
      const promedios = computePromedios([...otherSeasons, { season: input.season, matches: regular }], teamIds, p.seasons, p.counts, p.decimals);
      const lastPromedio = truncate(promedios.at(-1)!.average, p.decimals);
      const promedioTied = promedios.filter((r) => truncate(r.average, p.decimals) === lastPromedio).map((r) => r.teamId);
      const byPromedio = tiebreakLoser(promedioTied, sampler, rng);
      const annualRest = annual.filter((r) => r.teamId !== byPromedio);
      const lastPoints = annualRest.at(-1)!.points;
      const byAnnual = tiebreakLoser(annualRest.filter((r) => r.points === lastPoints).map((r) => r.teamId), sampler, rng);
      const relegated = new Set([byPromedio, byAnnual]);
      counts.get(byPromedio)!.relegatedByPromedio++;
      counts.get(byAnnual)!.relegatedByAnnual++;
      for (const t of relegated) objective(t, 'relegated');
      objective(annual[0].teamId, 'leagueChampion');

      // Zonas del torneo en curso y playoffs.
      const tournamentMatches = regular.filter((m) => m.tournamentId === tournamentId);
      const skipRelegated = rules.relegatedSkipPlayoffs.includes(tournamentId);
      const zones: ZoneTable[] = Object.entries(groups).map(([group, ids]) => {
        const rows = computeStandings(tournamentMatches, ids, 'zone', tieName);
        const eligible = rows.filter((r) => !(skipRelegated && relegated.has(r.teamId)));
        return { group, rows, playoffs: new Set(eligible.slice(0, rules.playoffSpotsPerZone).map((r) => r.teamId)) };
      });
      for (const zone of zones) {
        zone.rows.forEach((r, i) => {
          const c = counts.get(r.teamId)!;
          c.positions[i]++;
          c.expectedPoints += r.points;
          if (zone.playoffs.has(r.teamId)) objective(r.teamId, 'playoffs');
        });
      }
      const finalists = simulatePlayoffs(zones, realPlayoffs, sampler, rng);
      const champion = finalists?.champion;
      if (champion) {
        objective(champion, 'champion');
        outcome(`champion:${tournamentId}`, allTeamIndex.get(champion)!);
      }

      // Copas: la Copa Argentina va a penales directos; las finales de la CONMEBOL tienen alargue.
      // evenOdds: sin datos para comparar a los equipos (finales contra equipos de otros países), cada uno tiene 50%.
      const playCup = (competition: string, extraTime: boolean, evenOdds: boolean) => {
        const matches = completeCup(cup(competition), (home, away, phase) => {
          const m = evenOdds ? knockout(NEUTRAL_TEAM, NEUTRAL_TEAM, true, sampler, rng, extraTime) : knockout(home, away, true, sampler, rng, extraTime);
          return { ...m, homeId: home, awayId: away, phase };
        });
        for (const m of cup(competition).filter(isPending)) {
          const played = matches.find((x) => x.homeId === m.homeId && x.awayId === m.awayId && x.phase === m.phase);
          if (played) outcome(m.id, matchWinner(played) === m.homeId ? HOME : AWAY);
        }
        const progress = cupProgress(matches);
        if (progress.champion) outcome(`champion:${competition}`, allTeamIndex.get(progress.champion)!);
        return progress;
      };
      const copaArgentina = playCup('copa-argentina', false, false);
      if (copaArgentina.champion) objective(copaArgentina.champion, 'copaArgentina');
      const supercopa = playCup('supercopa-argentina', true, false);
      if (supercopa.champion) objective(supercopa.champion, 'supercopaArgentina');
      const conmebol = (['libertadores', 'sudamericana'] as const).flatMap((c) => {
        const champ = playCup(c, true, true).champion;
        return champ && teamIndex.has(champ) ? [{ teamId: champ, cup: c }] : [];
      });

      // Cupos a las copas del año que viene.
      const annualOrder = annual.map((r) => r.teamId);
      const annualPos = new Map(annualOrder.map((t, i) => [t, i]));
      const copaRanking = [...copaArgentina.reached]
        .filter(([t]) => teamIndex.has(t))
        .sort(([a, ra], [b, rb]) => rb - ra || annualPos.get(a)! - annualPos.get(b)!)
        .map(([t]) => t);
      const cups = allocateCups({
        annual: annualOrder,
        relegated,
        aperturaChampion: tournamentId === 'clausura' ? finishedFinalists.get('apertura')?.champion : undefined,
        clausuraChampion: tournamentId === 'clausura' ? champion : undefined,
        copaArgentinaRanking: copaRanking,
        conmebolChampions: conmebol,
        ...q,
      });
      for (const qt of cups.libertadores) {
        objective(qt.teamId, 'libertadores');
        samples.routes[it * teamIds.length + teamIndex.get(qt.teamId)!] = 1 + ROUTES.indexOf(qt.route);
      }
      for (const t of cups.sudamericana) objective(t, 'sudamericana');

      // Trofeo de Campeones (campeones del Apertura y el Clausura) y quién juega las supercopas del año que viene.
      const apertura = finishedFinalists.get('apertura');
      if (tournamentId === 'clausura' && apertura && finalists) {
        const plan = trofeoPlan(apertura, finalists);
        const rival = plan.kind === 'final' ? plan.teams[1] : matchWinner(knockout(plan.tiebreak[0], plan.tiebreak[1], true, sampler, rng))!;
        const first = plan.kind === 'final' ? plan.teams[0] : plan.champion;
        const trofeoWinner = matchWinner(knockout(first, rival, true, sampler, rng))!;
        const trofeo = { champion: trofeoWinner, runnerUp: trofeoWinner === first ? rival : first };
        objective(trofeo.champion, 'trofeo');
        outcome('champion:trofeo', allTeamIndex.get(trofeo.champion)!);
        if (copaArgentina.champion) for (const t of supercopaArgentinaTeams(trofeo, copaArgentina.champion)) objective(t, 'superArg');
        for (const t of supercopaInternacionalTeams(trofeo.champion, annualOrder, relegated)) objective(t, 'superInt');
      }
      // Recopa de Campeones del año que viene: campeones de la Copa Argentina y de las supercopas que se juegan este año.
      if (copaArgentina.champion && copaArgentina.runnerUp && supercopa.champion && supercopa.runnerUp && supercopaInternacional) {
        const recopa = recopaTeams(
          { champion: copaArgentina.champion, runnerUp: copaArgentina.runnerUp },
          { champion: supercopa.champion, runnerUp: supercopa.runnerUp },
          supercopaInternacional,
        );
        for (const t of recopa) objective(t, 'recopa');
      }
    }

    const teams: TeamOdds[] = [...counts].map(([teamId, c]) => {
      const t = teamIndex.get(teamId)!;
      const byObjective = Object.fromEntries(
        OBJECTIVES.map((o) => {
          let n = 0;
          for (let it = 0; it < iterations; it++) if (samples.objectives[it * teamIds.length + t] & objectiveBit(o)) n++;
          return [o, n / iterations];
        }),
      ) as Record<Objective, number>;
      return {
        ...byObjective,
        teamId,
        group: c.group,
        positions: c.positions.map((n) => n / iterations),
        expectedPoints: c.expectedPoints / iterations,
        relegatedByPromedio: c.relegatedByPromedio / iterations,
        relegatedByAnnual: c.relegatedByAnnual / iterations,
      };
    });
    return { iterations, tournamentId, simulatedMatches: pending.length, teams, samples };
  };
  return { run };
}

/** Suma dos tandas de simulaciones de la misma situación (mismos partidos y eventos). */
export function mergeResults(a: SimulationResult, b: SimulationResult): SimulationResult {
  const n = a.iterations + b.iterations;
  const avg = (x: number, y: number) => (x * a.iterations + y * b.iterations) / n;
  const teams = a.teams.map((ta) => {
    const tb = b.teams.find((t) => t.teamId === ta.teamId)!;
    const byObjective = Object.fromEntries(OBJECTIVES.map((o) => [o, avg(ta[o], tb[o])])) as Record<Objective, number>;
    return {
      ...ta,
      ...byObjective,
      positions: ta.positions.map((p, i) => avg(p, tb.positions[i])),
      expectedPoints: avg(ta.expectedPoints, tb.expectedPoints),
      relegatedByPromedio: avg(ta.relegatedByPromedio, tb.relegatedByPromedio),
      relegatedByAnnual: avg(ta.relegatedByAnnual, tb.relegatedByAnnual),
    };
  });
  const concat = <T extends Uint8Array | Uint16Array>(x: T, y: T): T => {
    const out = new (x.constructor as new (length: number) => T)(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  return {
    ...a,
    iterations: n,
    teams,
    samples: {
      ...a.samples,
      outcomes: concat(a.samples.outcomes, b.samples.outcomes),
      objectives: concat(a.samples.objectives, b.samples.objectives),
      routes: concat(a.samples.routes, b.samples.routes),
    },
  };
}

/** Juega lo que falta de la llave. Los partidos reales mandan; el resto se simula de a uno. */
function simulatePlayoffs(zones: ZoneTable[], real: Match[], sampler: ScoreSampler, rng: () => number): Finalists | undefined {
  const rank = new Map<TeamId, RankedRow>();
  for (const z of zones) for (const r of z.rows) rank.set(r.teamId, r);
  // Mejor ubicado = mejor posición en su zona; si es la misma, puntos, diferencia y goles (art. 11).
  const better = (a: TeamId, b: TeamId) => {
    const ra = rank.get(a)!;
    const rb = rank.get(b)!;
    const cmp = ra.position - rb.position || rb.points - ra.points || rb.goalDiff - ra.goalDiff || rb.goalsFor - ra.goalsFor;
    return cmp < 0 || (cmp === 0 && rng() < 0.5) ? a : b;
  };
  const played = [...real];
  for (;;) {
    const rounds = buildBracket(zones, played);
    const final = rounds.at(-1)!.slots[0];
    if (final.winner) return { champion: final.winner, runnerUp: final.teams[0] === final.winner ? final.teams[1]! : final.teams[0]! };
    const round = rounds.find((r) => r.slots.some((s) => !s.winner && s.teams[0] && s.teams[1]));
    const slot = round?.slots.find((s) => !s.winner && s.teams[0] && s.teams[1]);
    if (!round || !slot) return undefined;
    const [t1, t2] = slot.teams as [TeamId, TeamId];
    const neutral = round.phase === 'final';
    const home = better(t1, t2);
    const away = home === t1 ? t2 : t1;
    played.push({ ...knockout(home, away, neutral, sampler, rng), phase: round.phase });
  }
}

/** Partido que tiene que tener ganador: 90', alargue de 30' (si corresponde) y penales. */
function knockout(home: TeamId, away: TeamId, neutral: boolean, sampler: ScoreSampler, rng: () => number, extraTime = true): Match {
  let [h, a] = sampler.sample(home, away, neutral);
  let penalties: Match['penalties'];
  if (h === a && extraTime) {
    const [eh, ea] = sampler.sampleExtraTime(home, away, neutral);
    h += eh;
    a += ea;
  }
  if (h === a) penalties = rng() < 0.5 ? { home: 5, away: 4 } : { home: 4, away: 5 };
  return {
    id: `sim-${home}-${away}`,
    tournamentId: '',
    phase: 'final',
    date: '',
    homeId: home,
    awayId: away,
    status: 'finished',
    homeGoals: h,
    awayGoals: a,
    penalties,
    source: { provider: 'sim', externalId: '' },
  };
}

/** Quién pierde un desempate (por el descenso). Con 2 equipos se juega un partido neutral; con más, eliminación sucesiva. */
function tiebreakLoser(tied: TeamId[], sampler: ScoreSampler, rng: () => number): TeamId {
  let remaining = [...tied];
  while (remaining.length > 1) {
    const i = Math.floor(rng() * remaining.length);
    let j = Math.floor(rng() * (remaining.length - 1));
    if (j >= i) j++;
    const m = knockout(remaining[i], remaining[j], true, sampler, rng);
    const winner = matchWinner(m)!;
    // El ganador se salva; el perdedor sigue jugando contra los demás.
    remaining = remaining.filter((t) => t !== winner);
  }
  return remaining[0];
}

class ScoreSampler {
  private readonly cache = new Map<string, Float64Array>();
  private readonly ratings: Ratings;
  private readonly rng: () => number;

  constructor(ratings: Ratings, rng: () => number) {
    this.ratings = ratings;
    this.rng = rng;
  }

  sample(home: TeamId, away: TeamId, neutral: boolean, scale = 1): [number, number] {
    const key = `${home}|${away}|${neutral}|${scale}`;
    let cdf = this.cache.get(key);
    if (!cdf) {
      const [lh, la] = expectedGoals(this.ratings, home, away, neutral);
      const grid = scoreGrid(lh * scale, la * scale, scale === 1 ? this.ratings.rho : 0);
      cdf = new Float64Array((MAX_GOALS + 1) ** 2);
      let acc = 0;
      grid.forEach((row, i) => row.forEach((p, j) => (cdf![i * (MAX_GOALS + 1) + j] = acc += p)));
      this.cache.set(key, cdf);
    }
    const u = this.rng() * cdf[cdf.length - 1];
    let k = 0;
    while (cdf[k] < u) k++;
    return [Math.floor(k / (MAX_GOALS + 1)), k % (MAX_GOALS + 1)];
  }

  /** Alargue: 30 minutos = un tercio de los goles esperados. */
  sampleExtraTime(home: TeamId, away: TeamId, neutral: boolean): [number, number] {
    return this.sample(home, away, neutral, 1 / 3);
  }
}

/** Generador pseudoaleatorio con semilla (para tests reproducibles). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
