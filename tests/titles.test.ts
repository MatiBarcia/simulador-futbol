import { describe, expect, it } from 'vitest';
import { recopaTeams, supercopaArgentinaTeams, supercopaInternacionalTeams, trofeoPlan } from '../src/engine/titles.ts';

describe('trofeoPlan', () => {
  it('campeones distintos: final directa', () => {
    expect(trofeoPlan({ champion: 'a', runnerUp: 'b' }, { champion: 'c', runnerUp: 'd' })).toEqual({ kind: 'final', teams: ['a', 'c'] });
  });

  it('mismo campeón: desempate entre los subcampeones (art. 21)', () => {
    expect(trofeoPlan({ champion: 'a', runnerUp: 'b' }, { champion: 'a', runnerUp: 'd' })).toEqual({ kind: 'tiebreak', champion: 'a', tiebreak: ['b', 'd'] });
  });

  it('mismo campeón y mismo subcampeón: final directa entre ellos', () => {
    expect(trofeoPlan({ champion: 'a', runnerUp: 'b' }, { champion: 'a', runnerUp: 'b' })).toEqual({ kind: 'final', teams: ['a', 'b'] });
  });
});

describe('Supercopas', () => {
  it('Supercopa Argentina: si el ganador del Trofeo ganó la Copa, juega el subcampeón del Trofeo', () => {
    expect(supercopaArgentinaTeams({ champion: 'a', runnerUp: 'b' }, 'c')).toEqual(['a', 'c']);
    expect(supercopaArgentinaTeams({ champion: 'a', runnerUp: 'b' }, 'a')).toEqual(['a', 'b']);
  });

  it('Supercopa Internacional: el 2° de la tabla si repite; los descendidos se reemplazan', () => {
    const annual = ['t1', 't2', 't3', 't4'];
    expect(supercopaInternacionalTeams('t3', annual, new Set())).toEqual(['t3', 't1']);
    expect(supercopaInternacionalTeams('t1', annual, new Set())).toEqual(['t1', 't2']);
    expect(supercopaInternacionalTeams('t4', annual, new Set(['t4']))).toEqual(['t2', 't1']);
  });

  it('Recopa: subcampeones cuando se repite un club (art. 31)', () => {
    const copa = { champion: 'a', runnerUp: 'x' };
    expect(recopaTeams(copa, { champion: 'b', runnerUp: 'y' }, { champion: 'c', runnerUp: 'z' })).toEqual(['a', 'b', 'c']);
    // El campeón de la Copa también ganó la Supercopa Argentina.
    expect(recopaTeams(copa, { champion: 'a', runnerUp: 'y' }, { champion: 'c', runnerUp: 'z' })).toEqual(['a', 'y', 'c']);
    // La Supercopa Internacional la ganó alguien que ya está, y su subcampeón también: entra el subcampeón de la Copa.
    expect(recopaTeams(copa, { champion: 'b', runnerUp: 'y' }, { champion: 'b', runnerUp: 'a' })).toEqual(['a', 'b', 'x']);
  });
});
