import { describe, expect, it } from 'vitest';
import { CUP_COMPETITIONS, type SeasonData } from '../src/domain/types.ts';
import { buildLeagueView } from '../src/engine/league.ts';
import { expectedGoals, fitRatings, outcomeProbabilities, scoreGrid } from '../src/engine/model.ts';
import { applyFixed, simulate, type FixedResults } from '../src/engine/simulate.ts';
import { inferRounds } from '../src/engine/rounds.ts';
import { analyzeGoal, conditionalProbability, resultFor } from '../src/engine/analysis.ts';
import { hydrateAnalysis, precompute, simulationInputHash, type PrecomputedSimulation } from '../src/engine/precomputed.ts';
import { fixtureProvider } from './helpers.ts';

async function loadSeasons(): Promise<SeasonData[]> {
  const provider = fixtureProvider();
  return Promise.all(
    [2024, 2025, 2026].map(async (season) => {
      const s = await provider.getSeason('lpf', season);
      const matches = inferRounds(s.matches).sort((a, b) => a.date.localeCompare(b.date));
      return { competition: 'lpf' as const, season, provider: 'espn', generatedAt: '', ...s, matches };
    }),
  );
}

async function loadCups(): Promise<SeasonData[]> {
  const provider = fixtureProvider();
  return Promise.all(
    CUP_COMPETITIONS.map(async (competition) => ({ competition, season: 2026, provider: 'espn', generatedAt: '', ...(await provider.getSeason(competition, 2026)) })),
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('modelo de goles', () => {
  it('da probabilidades que suman 1 y ventaja de local', async () => {
    const seasons = await loadSeasons();
    const r = fitRatings(seasons.flatMap((s) => s.matches), { asOf: '2026-10-26', halfLifeDays: 730, priorGoals: 6, rho: -0.04 });
    expect(r.homeGoals).toBeGreaterThan(r.awayGoals);
    const [lh, la] = expectedGoals(r, 'boca-juniors', 'estudiantes-rc');
    const p = outcomeProbabilities(scoreGrid(lh, la, r.rho));
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10);
    expect(p.home).toBeGreaterThan(p.away);
    // Un equipo sin datos cuenta como promedio.
    expect(expectedGoals(r, 'equipo-nuevo', 'otro-nuevo')).toEqual([r.homeGoals, r.awayGoals]);
  });
});

describe('simulate', () => {
  it('las probabilidades son consistentes', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const result = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 300, seed: 42 });
    expect(result.tournamentId).toBe('clausura');
    expect(result.simulatedMatches).toBeGreaterThan(0);
    expect(sum(result.teams.map((t) => t.champion))).toBeCloseTo(1, 10);
    expect(sum(result.teams.map((t) => t.leagueChampion))).toBeCloseTo(1, 10);
    expect(sum(result.teams.map((t) => t.relegated))).toBeCloseTo(2, 10);
    expect(sum(result.teams.map((t) => t.playoffs))).toBeCloseTo(16, 10);
    for (const t of result.teams) expect(sum(t.positions)).toBeCloseTo(1, 10);
    // 6 cupos a la Libertadores, más uno por cada campeón argentino de la Libertadores o la Sudamericana.
    const libertadores = sum(result.teams.map((t) => t.libertadores));
    expect(libertadores).toBeGreaterThanOrEqual(6);
    expect(libertadores).toBeLessThanOrEqual(8);
    expect(sum(result.teams.map((t) => t.sudamericana))).toBeCloseTo(6, 10);
    // Belgrano ganó el Apertura y no puede descender: tiene la Libertadores asegurada.
    expect(result.teams.find((t) => t.teamId === 'belgrano')!.libertadores).toBe(1);
    // Est. Río Cuarto no puede salvarse del último puesto en promedios.
    expect(result.teams.find((t) => t.teamId === 'estudiantes-rc')!.relegatedByPromedio).toBe(1);

    // Títulos nacionales: un campeón por título y la cantidad justa de participantes en las supercopas del año que viene.
    for (const title of ['trofeo', 'copaArgentina', 'supercopaArgentina'] as const) expect(sum(result.teams.map((t) => t[title]))).toBeCloseTo(1, 10);
    expect(sum(result.teams.map((t) => t.superArg))).toBeCloseTo(2, 10);
    expect(sum(result.teams.map((t) => t.superInt))).toBeCloseTo(2, 10);
    expect(sum(result.teams.map((t) => t.recopa))).toBeCloseTo(3, 10);
    // Belgrano (campeón del Apertura) juega el Trofeo; Rosario Central ganó la Supercopa Internacional 2026: juega la Recopa.
    expect(result.teams.find((t) => t.teamId === 'belgrano')!.trofeo).toBeGreaterThan(0);
    expect(result.teams.find((t) => t.teamId === 'rosario-central')!.recopa).toBe(1);
    // Solo Estudiantes o Ind. Rivadavia pueden ganar la Supercopa Argentina 2026.
    const supercopa = result.teams.filter((t) => t.supercopaArgentina > 0).map((t) => t.teamId).sort();
    expect(supercopa).toEqual(['estudiantes-lp', 'independiente-rivadavia']);
  });

  it('es reproducible con la misma semilla', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const a = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 100, seed: 7 });
    const b = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 100, seed: 7 });
    expect(a).toEqual(b);
  });

  it('con todos los resultados fijados, la fase regular deja de ser aleatoria', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const current = seasons[2];
    const pending = current.matches.filter((m) => m.phase === 'regular' && m.status !== 'finished');
    const fixed: FixedResults = Object.fromEntries(pending.map((m) => [m.id, { home: 1, away: 0 }]));
    const result = simulate({ seasons, cups, season: 2026, fixed, iterations: 50, seed: 1 });
    expect(result.simulatedMatches).toBe(0);

    const view = buildLeagueView(seasons.map((s) => (s.season === 2026 ? { ...s, matches: applyFixed(s.matches, fixed) } : s)), 2026);
    const leader = view.annual[0].teamId;
    expect(result.teams.find((t) => t.teamId === leader)!.leagueChampion).toBe(1);
    for (const zone of view.zones.clausura) {
      for (const row of zone.rows) {
        const odds = result.teams.find((t) => t.teamId === row.teamId)!;
        if (!row.unresolvedTie) expect(odds.positions[row.position - 1]).toBe(1);
      }
    }
  });
});

describe('analyzeGoal', () => {
  it('explica qué necesita un equipo', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const result = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 400, seed: 3 });
    const odds = result.teams.find((t) => t.teamId === 'river-plate')!;
    const analysis = analyzeGoal(result.samples, 'river-plate', 'libertadores');
    expect(analysis.probability).toBeCloseTo(odds.libertadores, 10);
    // Sus partidos que faltan aparecen, y ganar le conviene más que perder.
    expect(analysis.ownMatches.length).toBeGreaterThan(0);
    for (const m of analysis.ownMatches) {
      const win = m.outcomes.find((o) => resultFor(m.event, o.value, 'river-plate') === 'win');
      const loss = m.outcomes.find((o) => resultFor(m.event, o.value, 'river-plate') === 'loss');
      if (win && loss && win.frequency > 0.1 && loss.frequency > 0.1) expect(win.probability).toBeGreaterThanOrEqual(loss.probability);
    }
    // Las vías suman la probabilidad total.
    expect(sum(analysis.routes.map((r) => r.probability))).toBeCloseTo(analysis.probability, 10);
    if (analysis.probability > 0) expect(analysis.path).toBeDefined();
    // El Trofeo y la Supercopa Argentina no dan cupos: no aparecen como algo que lo ayude (River puede ganar el Trofeo
    // sin ganar el Clausura, como subcampeón del Apertura, y eso daba un "si gana el Trofeo → 86%" sin sentido).
    const competitions = [...analysis.ownMatches, ...analysis.helpers, ...(analysis.path?.steps.map((s) => s.effect) ?? [])].map((x) => x.event.competition);
    expect(competitions).not.toContain('trofeo');
    expect(competitions).not.toContain('supercopa-argentina');

    // Elegir resultados de sus partidos: sin elegir nada da la chance de hoy; fijar uno da lo mismo que su efecto.
    const scenarios = analysis.scenarios!;
    expect(scenarios.events).toEqual(analysis.ownMatches.map((m) => m.index).slice(0, scenarios.events.length));
    expect(conditionalProbability(scenarios, new Map()).probability).toBeCloseTo(analysis.probability, 10);
    const first = analysis.ownMatches[0];
    for (const o of first.outcomes) {
      expect(conditionalProbability(scenarios, new Map([[first.index, o.value]])).probability).toBeCloseTo(o.probability, 10);
    }

    expect(analyzeGoal(result.samples, 'belgrano', 'libertadores').status).toBe('done');
    expect(analyzeGoal(result.samples, 'estudiantes-rc', 'safe').status).toBe('out');
  });
});

describe('simulación precalculada', () => {
  it('guarda y recupera el mismo análisis', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const result = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 300, seed: 5 });
    const hash = simulationInputHash(seasons, cups);
    // Pasa por JSON, como en el sitio.
    const pre = JSON.parse(JSON.stringify(precompute(result, hash))) as PrecomputedSimulation;
    expect(pre.basedOn).toBe(hash);
    for (const goal of ['libertadores', 'safe'] as const) {
      const direct = analyzeGoal(result.samples, 'river-plate', goal);
      const hydrated = hydrateAnalysis(pre, 'river-plate', goal)!;
      expect(hydrated.probability).toBe(direct.probability);
      expect(hydrated.ownMatches).toEqual(direct.ownMatches);
      expect(hydrated.helpers).toEqual(direct.helpers.slice(0, 8));
      expect(hydrated.path?.steps.map((s) => [s.effect.index, s.value])).toEqual(direct.path?.steps.map((s) => [s.effect.index, s.value]));
    }
  });

  it('la huella no cambia con el minuto de un partido en juego, sí con un resultado final', async () => {
    const seasons = await loadSeasons();
    const cups = await loadCups();
    const base = simulationInputHash(seasons, cups);
    const pending = seasons[2].matches.find((m) => m.status !== 'finished')!;
    const withLive = seasons.map((s, i) => (i === 2 ? { ...s, matches: s.matches.map((m) => (m.id === pending.id ? { ...m, status: 'live' as const, homeGoals: 1, awayGoals: 0, clock: "67'" } : m)) } : s));
    expect(simulationInputHash(withLive, cups)).toBe(base);
    const withFinal = seasons.map((s, i) => (i === 2 ? { ...s, matches: s.matches.map((m) => (m.id === pending.id ? { ...m, status: 'finished' as const, homeGoals: 1, awayGoals: 0 } : m)) } : s));
    expect(simulationInputHash(withFinal, cups)).not.toBe(base);
  });
});
