import { describe, expect, it } from 'vitest';
import { CUP_COMPETITIONS, type SeasonData } from '../src/domain/types.ts';
import { simulate } from '../src/engine/simulate.ts';
import { buildTitleGraph, type TitleState } from '../src/engine/titleGraph.ts';
import { inferRounds } from '../src/engine/rounds.ts';
import { fixtureProvider } from './helpers.ts';

async function load() {
  const provider = fixtureProvider();
  const seasons: SeasonData[] = await Promise.all(
    [2024, 2025, 2026].map(async (season) => {
      const s = await provider.getSeason('lpf', season);
      return { competition: 'lpf' as const, season, provider: 'espn', generatedAt: '', ...s, matches: inferRounds(s.matches) };
    }),
  );
  const cups: SeasonData[] = await Promise.all(
    CUP_COMPETITIONS.map(async (competition) => ({ competition, season: 2026, provider: 'espn', generatedAt: '', ...(await provider.getSeason(competition, 2026)) })),
  );
  return { seasons, cups };
}

const champion = (state: TitleState) => (state.kind === 'decided' ? state.champion : state.kind);

describe('buildTitleGraph', () => {
  it('camino a la Recopa 2027: los títulos de 2025 ya jugados', async () => {
    const { seasons, cups } = await load();
    const g = buildTitleGraph({ seasons, cups, current: 2026 }, 2027);
    expect(g.levels.flat()).toHaveLength(9);
    expect(champion(g.nodes['apertura-2025'].state)).toBe('platense');
    expect(champion(g.nodes['clausura-2025'].state)).toBe('estudiantes-lp');
    expect(champion(g.nodes['trofeo-2025'].state)).toBe('estudiantes-lp');
    expect(champion(g.nodes['copaArgentina-2025'].state)).toBe('independiente-rivadavia');
    expect(champion(g.nodes['liga-2025'].state)).toBe('rosario-central');
    expect(champion(g.nodes['supercopaInternacional-2026'].state)).toBe('rosario-central');
    // La Supercopa Argentina 2026 todavía no se jugó: Estudiantes (Trofeo 2025) vs Ind. Rivadavia (Copa Argentina 2025).
    expect(g.nodes['supercopaArgentina-2026'].state).toMatchObject({ kind: 'match', teams: ['estudiantes-lp', 'independiente-rivadavia'] });
    expect(g.nodes['copaArgentina-2026'].state.kind).toBe('open');
    expect(g.nodes['recopa-2027'].state.kind).toBe('entrants');
    // El Clausura 2025 se definió por penales: el marcador va desde el lado del campeón.
    expect(g.nodes['clausura-2025'].state).toMatchObject({ runnerUp: 'racing-club', score: '1-1 (5-4 pen.)' });
  });

  it('camino a la Recopa 2028: los títulos de 2026, con probabilidades', async () => {
    const { seasons, cups } = await load();
    const result = simulate({ seasons, cups, season: 2026, fixed: {}, iterations: 200, seed: 9 });
    const g = buildTitleGraph({ seasons, cups, current: 2026, odds: result.teams, tournamentId: result.tournamentId }, 2028);
    expect(champion(g.nodes['apertura-2026'].state)).toBe('belgrano');
    for (const id of ['clausura-2026', 'trofeo-2026', 'liga-2026', 'copaArgentina-2026']) {
      const state = g.nodes[id].state;
      expect(state.kind).toBe('open');
      if (state.kind === 'open') expect(state.odds.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 10);
    }
    const superArg = g.nodes['supercopaArgentina-2027'].state;
    expect(superArg.kind).toBe('entrants');
    if (superArg.kind === 'entrants') expect(superArg.odds.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(2, 10);
    expect(g.nodes['recopa-2028'].state.kind).toBe('future');
  });
});
