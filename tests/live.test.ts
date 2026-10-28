import { describe, expect, it } from 'vitest';
import type { Match, SeasonData } from '../src/domain/types.ts';
import { applyLive, daysToCheck, pendingNow } from '../src/engine/live.ts';

const match = (id: string, date: string, extra: Partial<Match> = {}): Match => ({
  id,
  tournamentId: 'clausura',
  phase: 'regular',
  date,
  homeId: 'boca-juniors',
  awayId: 'river-plate',
  status: 'scheduled',
  source: { provider: 'espn', externalId: id },
  ...extra,
});

const season = (matches: Match[]): SeasonData => ({
  competition: 'lpf',
  season: 2026,
  provider: 'espn',
  generatedAt: '',
  teams: [],
  tournaments: [],
  matches,
});

// 27/10/2026 22:00 en Argentina.
const now = new Date('2026-10-28T01:00:00Z');

describe('resultados del día', () => {
  it('consulta lo que está en juego, por empezar o atrasado; no lo terminado, lo lejano ni lo viejo', () => {
    const matches = [
      match('jugando', '2026-10-28T00:15:00Z', { status: 'live' }),
      match('por-empezar', '2026-10-28T01:05:00Z'),
      match('atrasado', '2026-10-27T20:00:00Z'),
      match('terminado', '2026-10-27T22:00:00Z', { status: 'finished', homeGoals: 1, awayGoals: 0 }),
      match('mas-tarde', '2026-10-28T03:00:00Z'),
      match('postergado-hace-dias', '2026-10-20T20:00:00Z'),
    ];
    expect(pendingNow(matches, now).map((m) => m.id)).toEqual(['jugando', 'por-empezar', 'atrasado']);
    // A las 21:15 de Argentina del 27 ya es 28 en UTC, pero el día del partido es el 27 (en Argentina y en Nueva York).
    expect(daysToCheck([season(matches)], now)).toEqual([{ competition: 'lpf', season: 2026, days: ['20261027'] }]);
    expect(daysToCheck([season([matches[3], matches[4]])], now)).toEqual([]);
  });

  it('aplica los resultados nuevos sin volver atrás uno terminado', () => {
    const published = season([
      match('a', '2026-10-28T00:15:00Z', { status: 'live', homeGoals: 0, awayGoals: 0, clock: "30'" }),
      match('b', '2026-10-27T20:00:00Z', { status: 'finished', homeGoals: 2, awayGoals: 1 }),
    ]);
    const fresh = new Map([
      ['a', match('a', '2026-10-28T00:15:00Z', { status: 'finished', homeGoals: 1, awayGoals: 0 })],
      ['b', match('b', '2026-10-27T20:00:00Z', { status: 'live', homeGoals: 0, awayGoals: 0 })],
      ['nuevo', match('nuevo', '2026-10-28T00:15:00Z')],
    ]);
    const updated = applyLive(published, fresh);
    expect(updated.matches.map((m) => [m.id, m.status, m.homeGoals, m.awayGoals, m.clock])).toEqual([
      ['a', 'finished', 1, 0, undefined],
      ['b', 'finished', 2, 1, undefined],
    ]);
    // Sin cambios, devuelve el mismo objeto (no se recalculan las tablas).
    expect(applyLive(updated, fresh)).toBe(updated);
  });
});
