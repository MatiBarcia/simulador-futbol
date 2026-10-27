import { describe, expect, it } from 'vitest';
import type { EspnStandings } from '../src/adapters/espn/types.ts';
import { mapTeam } from '../src/adapters/espn/mapping.ts';
import type { Match } from '../src/domain/types.ts';
import { buildBracket } from '../src/engine/bracket.ts';
import { buildLeagueView } from '../src/engine/league.ts';
import { computePromedios, truncate } from '../src/engine/promedios.ts';
import { computeStandings } from '../src/engine/standings.ts';
import { promediosRules } from '../src/rules/lpf.ts';
import { fixtureProvider, readFixture } from './helpers.ts';

const match = (homeId: string, awayId: string, homeGoals: number, awayGoals: number, date = '2026-01-01'): Match => ({
  id: `${homeId}-${awayId}-${date}`,
  tournamentId: 't',
  phase: 'regular',
  date,
  homeId,
  awayId,
  status: 'finished',
  homeGoals,
  awayGoals,
  source: { provider: 'test', externalId: '' },
});

describe('computeStandings', () => {
  it('desempata por diferencia, goles a favor y después entre ellos (zona)', () => {
    // a, b y c terminan con 4 puntos, diferencia 0 y 3 goles a favor; d empata todo.
    const matches = [
      match('a', 'b', 2, 1),
      match('b', 'c', 1, 0),
      match('c', 'a', 2, 1),
      match('a', 'd', 0, 0),
      match('b', 'd', 1, 1),
      match('c', 'd', 1, 1),
    ];
    const zone = computeStandings(matches, ['a', 'b', 'c', 'd'], 'zone');
    // Entre ellos los tres tienen 3 puntos y diferencia 0: a hizo 3 goles, b y c 2. Entre b y c, ganó b.
    expect(zone.map((r) => r.teamId)).toEqual(['a', 'b', 'c', 'd']);
    expect(zone[0]).toMatchObject({ points: 4, played: 3, goalDiff: 0, goalsFor: 3, unresolvedTie: false });

    const general = computeStandings(matches, ['a', 'b', 'c', 'd'], 'general');
    expect(general.slice(0, 3).every((r) => r.unresolvedTie)).toBe(true);
  });

  it('la tabla del Clausura 2026 coincide con la de ESPN', async () => {
    const season = await fixtureProvider().getSeason('lpf', 2026);
    const espn = readFixture<EspnStandings>('arg.1-standings-2026.json');
    const clausura = season.matches.filter((m) => m.tournamentId === 'clausura' && m.phase === 'regular');
    for (const group of espn.children!) {
      const ids = group.standings.entries.map((e) => mapTeam(e.team).id);
      const ours = computeStandings(clausura, ids, 'zone');
      const expected = group.standings.entries.map((e) => {
        const stat = (n: string) => e.stats.find((s) => s.name === n)!.value;
        return { teamId: mapTeam(e.team).id, played: stat('gamesPlayed'), points: stat('points'), goalDiff: stat('pointDifferential') };
      });
      expect(ours.map(({ teamId, played, points, goalDiff }) => ({ teamId, played, points, goalDiff })).sort(byId)).toEqual(expected.sort(byId));
    }
  });
});

const byId = (a: { teamId: string }, b: { teamId: string }) => a.teamId.localeCompare(b.teamId);

describe('computePromedios', () => {
  it('trunca, no redondea', () => {
    expect(truncate(100 / 91, 3)).toBe('1.098');
    expect(truncate(1.2, 3)).toBe('1.200');
  });

  it('coincide con la tabla publicada por La Nación tras la fecha 2 del Clausura 2026', async () => {
    const provider = fixtureProvider();
    const cutoff = '2026-08-01';
    const data = await Promise.all(
      [2024, 2025, 2026].map(async (season) => ({
        season,
        matches: (await provider.getSeason('lpf', season)).matches.filter((m) => m.date < cutoff),
      })),
    );
    const teams = (await provider.getSeason('lpf', 2026)).teams.map((t) => t.id);
    const rules = promediosRules(2026);
    const table = computePromedios(data, teams, rules.seasons, rules.counts, rules.decimals);
    const shown = Object.fromEntries(table.map((r) => [r.teamId, truncate(r.average, 3)]));

    // https://www.lanacion.com.ar/deportes/futbol/tabla-de-promedios-2026-asi-estan-las-posiciones-que-definen-un-descenso-en-la-fecha-2-del-clausura-nid31072026/
    expect(shown).toMatchObject({
      'estudiantes-rc': '0.444',
      aldosivi: '0.840',
      sarmiento: '0.978',
      banfield: '1.065',
      'newells-old-boys': '1.098',
      'central-cordoba-sde': '1.098',
      'atletico-tucuman': '1.120',
    });
    expect(table.at(-1)!.teamId).toBe('estudiantes-rc');
    // Los recién ascendidos solo promedian lo que jugaron en Primera.
    expect(table.find((r) => r.teamId === 'estudiantes-rc')!.bySeason).toEqual({ 2026: { points: 8, played: 18 } });
  });
});

describe('buildBracket', () => {
  it('la llave del Apertura 2026 coincide con el cuadro fijo y la ganó Belgrano', async () => {
    const provider = fixtureProvider();
    const seasons = await Promise.all(
      [2024, 2025, 2026].map(async (season) => {
        const s = await provider.getSeason('lpf', season);
        return { competition: 'lpf' as const, season, provider: 'espn', generatedAt: '', ...s };
      }),
    );
    const view = buildLeagueView(seasons, 2026);
    const playoffs = seasons[2].matches.filter((m) => m.tournamentId === 'apertura' && m.phase !== 'regular');
    const bracket = buildBracket(view.zones.apertura, playoffs);

    expect(bracket.map((r) => r.slots.length)).toEqual([8, 4, 2, 1]);
    // Todos los octavos reales coinciden con la proyección desde la tabla (1°A-8°B, ...).
    expect(bracket[0].slots.every((s) => s.match && s.seeds)).toBe(true);
    // Cada ganador aparece en el cruce que le corresponde de la ronda siguiente.
    for (let r = 1; r < bracket.length; r++) {
      bracket[r].slots.forEach((slot, i) => {
        expect(slot.teams).toEqual([bracket[r - 1].slots[2 * i].winner, bracket[r - 1].slots[2 * i + 1].winner]);
      });
    }
    expect(bracket[3].slots[0].winner).toBe('belgrano');
    expect(bracket[3].slots[0].teams).toContain('river-plate');
  });

  it('sin partidos jugados proyecta los octavos desde la tabla', async () => {
    const provider = fixtureProvider();
    const seasons = await Promise.all(
      [2024, 2025, 2026].map(async (season) => {
        const s = await provider.getSeason('lpf', season);
        return { competition: 'lpf' as const, season, provider: 'espn', generatedAt: '', ...s };
      }),
    );
    const view = buildLeagueView(seasons, 2026);
    const bracket = buildBracket(view.zones.clausura, []);
    const [zoneA, zoneB] = view.zones.clausura;
    const first = (z: typeof zoneA) => z.rows.find((r) => z.playoffs.has(r.teamId))!.teamId;
    expect(bracket[0].slots[0].seeds).toEqual(['1A', '8B']);
    expect(bracket[0].slots[0].teams[0]).toBe(first(zoneA));
    expect(bracket[0].slots[4].teams[0]).toBe(first(zoneB));
    expect(bracket[1].slots.every((s) => s.teams.every((t) => t === undefined))).toBe(true);
  });
});
