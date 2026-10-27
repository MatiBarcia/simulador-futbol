import { describe, expect, it } from 'vitest';
import { mapEvent, mapSlug, mapStatus } from '../src/adapters/espn/mapping.ts';
import type { EspnEvent } from '../src/adapters/espn/types.ts';
import { seasonDataSchema } from '../src/domain/schema.ts';
import { inferRounds } from '../src/engine/rounds.ts';
import { fixtureProvider } from './helpers.ts';

describe('mapSlug', () => {
  it('reconoce torneos y fases', () => {
    expect(mapSlug('arg.1', 'torneo-clausura')).toEqual({ tournamentId: 'clausura', phase: 'regular' });
    expect(mapSlug('arg.1', 'apertura---round-of-16')).toEqual({ tournamentId: 'apertura', phase: 'round-of-16' });
    expect(mapSlug('arg.1', '2024-argentine-liga-profesional')).toEqual({ tournamentId: 'liga', phase: 'regular' });
    expect(mapSlug('arg.copa_lpf', 'group-stage')).toEqual({ tournamentId: 'copa-de-la-liga', phase: 'regular' });
    expect(mapSlug('arg.copa_lpf', 'final')).toEqual({ tournamentId: 'copa-de-la-liga', phase: 'final' });
  });

  it('falla con un slug desconocido', () => {
    expect(() => mapSlug('arg.1', 'algo-nuevo')).toThrow(/desconocido/);
  });
});

describe('mapStatus', () => {
  it('mapea estados conocidos y usa un default seguro', () => {
    expect(mapStatus('STATUS_FINAL_PEN', 'post')).toBe('finished');
    expect(mapStatus('STATUS_SECOND_HALF', 'in')).toBe('live');
    expect(mapStatus('STATUS_HALFTIME', 'in')).toBe('live');
    expect(mapStatus('STATUS_POSTPONED', 'post')).toBe('postponed');
    expect(mapStatus('STATUS_ALGO_NUEVO', 'pre')).toBe('scheduled');
  });
});

describe('mapEvent', () => {
  it('traduce un partido definido por penales', () => {
    const event: EspnEvent = {
      id: '123',
      date: '2026-05-10T20:00Z',
      season: { year: 2026, slug: 'apertura---quarterfinals' },
      status: { type: { name: 'STATUS_FINAL_PEN', state: 'post' } },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', score: '2', shootoutScore: 4, team: { id: '16', displayName: 'River Plate', shortDisplayName: 'River Plate' } },
            { homeAway: 'away', score: '2', shootoutScore: 3, team: { id: '5', displayName: 'Boca Juniors', shortDisplayName: 'Boca ' } },
          ],
        },
      ],
    };
    expect(mapEvent('arg.1', event)).toEqual({
      id: 'espn-123',
      tournamentId: 'apertura',
      phase: 'quarterfinals',
      date: '2026-05-10T20:00Z',
      homeId: 'river-plate',
      awayId: 'boca-juniors',
      status: 'finished',
      homeGoals: 2,
      awayGoals: 2,
      penalties: { home: 4, away: 3 },
      source: { provider: 'espn', externalId: '123' },
    });
  });
});

describe('EspnProvider con fixtures', () => {
  it('arma 2024 con la Copa de la Liga y la Liga', async () => {
    const s = await fixtureProvider().getSeason('lpf', 2024);
    expect(s.tournaments.map((t) => t.id)).toEqual(['copa-de-la-liga', 'liga']);
    expect(s.teams).toHaveLength(28);
    expect(s.matches.filter((m) => m.tournamentId === 'copa-de-la-liga' && m.phase === 'regular')).toHaveLength(196);
    expect(s.matches.filter((m) => m.tournamentId === 'liga')).toHaveLength(378);
  });

  it('2026: zonas, ids propios y una fecha por partido para cada equipo', async () => {
    const s = await fixtureProvider().getSeason('lpf', 2026);
    const clausura = s.tournaments.find((t) => t.id === 'clausura')!;
    expect(Object.keys(clausura.groups!)).toEqual(['A', 'B']);
    expect(clausura.groups!.A).toHaveLength(15);
    expect(s.teams.every((t) => !/^\d/.test(t.id))).toBe(true);

    const matches = inferRounds(s.matches);
    for (const t of ['apertura', 'clausura']) {
      const regular = matches.filter((m) => m.tournamentId === t && m.phase === 'regular');
      expect(new Set(regular.map((m) => m.round))).toEqual(new Set(Array.from({ length: 16 }, (_, i) => i + 1)));
      for (let r = 1; r <= 16; r++) expect(regular.filter((m) => m.round === r)).toHaveLength(15);
    }
    expect(() =>
      seasonDataSchema.parse({ competition: 'lpf', season: 2026, provider: 'espn', generatedAt: new Date().toISOString(), ...s, matches }),
    ).not.toThrow();
  });
});
