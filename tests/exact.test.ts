import { beforeAll, describe, expect, it } from 'vitest';
import { CUP_COMPETITIONS, type SeasonData } from '../src/domain/types.ts';
import { createExactAnalysis, EXACT_GOALS, type FeasibilitySolver } from '../src/engine/exact.ts';
import { inferRounds } from '../src/engine/rounds.ts';
import { simulate, type FixedResults } from '../src/engine/simulate.ts';
import { createSolver } from '../scripts/solver.ts';
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

let solve: FeasibilitySolver;
let seasons: SeasonData[];
let cups: SeasonData[];
beforeAll(async () => {
  solve = await createSolver();
  seasons = await loadSeasons();
  cups = await loadCups();
});

describe('¿todavía puede? (exacto)', () => {
  it('no contradice a la simulación', () => {
    const exact = createExactAnalysis({ seasons, cups, season: 2026 }, solve);
    const sim = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 2000, seed: 3 });
    for (const t of sim.teams) {
      for (const goal of EXACT_GOALS) {
        const a = exact.answer(t.teamId, goal);
        // Para la Libertadores solo se responde cuando ya está clasificado.
        if (!a) {
          expect(goal).toBe('libertadores');
          continue;
        }
        const p = goal === 'safe' ? 1 - t.relegated : t[goal];
        // Si pasó en alguna simulación, es posible; si falló en alguna, no está asegurado.
        if (p > 0) expect(a.possible, `${t.teamId} ${goal}`).not.toBe('no');
        if (p < 1) expect(a.guaranteed, `${t.teamId} ${goal}`).not.toBe('yes');
        if (a.possible === 'no') expect(p).toBe(0);
        if (a.guaranteed === 'yes') expect(p).toBe(1);
      }
    }
  });

  it('los que ya tienen copa asegurada la juegan en todas las simulaciones', () => {
    const clinched = createExactAnalysis({ seasons, cups, season: 2026 }, solve).clinched();
    const sim = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 2000, seed: 5 });
    expect(clinched.length).toBeGreaterThan(0);
    for (const c of clinched) {
      const t = sim.teams.find((x) => x.teamId === c.teamId)!;
      // Con 'ties' puede fallar por un desempate, que la simulación sortea.
      if (c.certainty !== 'yes') continue;
      if (c.cup === 'libertadores') expect(t.libertadores, c.teamId).toBe(1);
      else expect(t.libertadores + t.sudamericana, c.teamId).toBeCloseTo(1, 9);
    }
  });

  it('con todo jugado, coincide con la tabla final', () => {
    const current = seasons.find((s) => s.season === 2026)!;
    // Gana siempre el local, 1-0.
    const fixed: FixedResults = Object.fromEntries(
      current.matches.filter((m) => m.phase === 'regular' && m.status !== 'finished').map((m) => [m.id, { home: 1, away: 0 }]),
    );
    const exact = createExactAnalysis({ seasons, season: 2026, fixed }, solve);
    const sim = simulate({ seasons, cups: [], season: 2026, fixed, iterations: 200, seed: 1 });
    for (const t of sim.teams) {
      const a = exact.answer(t.teamId, 'playoffs')!;
      // Sin partidos pendientes, o se sabe (yes/yes, no/no) o depende de un desempate (ties).
      if (t.playoffs === 1) expect(a.guaranteed).not.toBe('no');
      if (t.playoffs === 0) expect(a.possible).not.toBe('yes');
      if (a.possible === 'yes' && a.guaranteed === 'yes') expect(t.playoffs).toBe(1);
      if (a.possible === 'no') expect(t.playoffs).toBe(0);
      // Con la fase regular terminada, el campeón ya no se responde por acá (lo define la llave).
      expect(exact.answer(t.teamId, 'champion')).toBeUndefined();
    }
  });
});
