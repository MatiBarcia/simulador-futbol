import { describe, expect, it } from 'vitest';
import { allocateCups, type QualificationInput } from '../src/engine/qualification.ts';

// Tabla anual ficticia: t1 es el 1°, t10 el 10°, ...
const annual = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);
const base: QualificationInput = {
  annual,
  relegated: new Set(['t19', 't20']),
  aperturaChampion: 't5',
  clausuraChampion: 't8',
  copaArgentinaRanking: ['t12', 't3'],
  conmebolChampions: [],
  libertadoresTableSpots: 3,
  sudamericanaSpots: 6,
};
const lib = (input: QualificationInput) => allocateCups(input).libertadores.map((q) => `${q.teamId}:${q.route}${q.playoffRound ? '*' : ''}`);

describe('allocateCups', () => {
  it('caso normal: campeones, Copa Argentina y los 3 mejores de la tabla', () => {
    expect(lib(base)).toEqual(['t5:apertura', 't8:clausura', 't12:copa-argentina', 't1:tabla', 't2:tabla', 't3:tabla*']);
    expect(allocateCups(base).sudamericana).toEqual(['t4', 't6', 't7', 't9', 't10', 't11']);
  });

  it('el mismo club gana Apertura y Clausura: el cupo pasa a la tabla (27.7)', () => {
    expect(lib({ ...base, clausuraChampion: 't5' })).toEqual(['t5:apertura', 't12:copa-argentina', 't1:tabla', 't2:tabla', 't3:tabla', 't4:tabla*']);
  });

  it('el campeón de la Copa ya clasificó: el cupo pasa al siguiente de la Copa (27.8)', () => {
    expect(lib({ ...base, copaArgentinaRanking: ['t5', 't3', 't14'] })).toContain('t3:copa-argentina');
  });

  it('un campeón descendido no puede jugar (28.2)', () => {
    expect(lib({ ...base, clausuraChampion: 't20' })).toEqual(['t5:apertura', 't12:copa-argentina', 't1:tabla', 't2:tabla', 't3:tabla', 't4:tabla*']);
  });

  it('el campeón de la Sudamericana suma una plaza y su cupo anterior se reasigna (27.10)', () => {
    expect(lib({ ...base, conmebolChampions: [{ teamId: 't8', cup: 'sudamericana' }] })).toEqual([
      't8:sudamericana',
      't5:apertura',
      't12:copa-argentina',
      't1:tabla',
      't2:tabla',
      't3:tabla',
      't4:tabla*',
    ]);
  });
});
