// Modelo de goles por partido: Poisson con fuerza de ataque y defensa por equipo, ventaja de local
// y la corrección de Dixon-Coles para los resultados bajos (el fútbol argentino tiene muchos empates).
import { isPlayed, type Match, type TeamId } from '../domain/types.ts';

export interface Ratings {
  attack: Map<TeamId, number>;
  defense: Map<TeamId, number>; // > 1 = recibe más goles que el promedio
  homeGoals: number; // goles esperados de un local promedio contra un visitante promedio
  awayGoals: number;
  /** Correlación de Dixon-Coles (negativa = más 0-0 y 1-1 que un Poisson independiente). */
  rho: number;
}

export interface FitOptions {
  /** Fecha de referencia: los partidos más viejos pesan menos. */
  asOf: string;
  /** Cada cuántos días un partido pesa la mitad. */
  halfLifeDays: number;
  /** Goles ficticios "promedio" que se suman a cada equipo, para no sobreajustar con pocos partidos. */
  priorGoals: number;
  rho: number;
}

// Calibrado con validación hacia adelante sobre 689 partidos de 2025-2026 (scripts/calibrate.ts).
export const DEFAULT_FIT: Omit<FitOptions, 'asOf'> = { halfLifeDays: 730, priorGoals: 6, rho: -0.04 };

export function fitRatings(matches: Match[], options: FitOptions): Ratings {
  const asOf = Date.parse(options.asOf);
  const played = matches
    .filter((m) => isPlayed(m) && Date.parse(m.date) <= asOf)
    .map((m) => ({ m, w: 0.5 ** ((asOf - Date.parse(m.date)) / 86_400_000 / options.halfLifeDays) }));

  const teams = new Set(played.flatMap(({ m }) => [m.homeId, m.awayId]));
  const attack = new Map([...teams].map((t) => [t, 1]));
  const defense = new Map([...teams].map((t) => [t, 1]));
  let totalW = 0;
  let homeSum = 0;
  let awaySum = 0;
  for (const { m, w } of played) {
    totalW += w;
    homeSum += w * m.homeGoals!;
    awaySum += w * m.awayGoals!;
  }
  const homeGoals = totalW ? homeSum / totalW : 1.2;
  const awayGoals = totalW ? awaySum / totalW : 0.9;
  const k = options.priorGoals;

  for (let iter = 0; iter < 30; iter++) {
    const scored = new Map<TeamId, [goals: number, expected: number]>();
    const conceded = new Map<TeamId, [goals: number, expected: number]>();
    const add = (map: typeof scored, t: TeamId, g: number, e: number) => {
      const v = map.get(t) ?? [0, 0];
      map.set(t, [v[0] + g, v[1] + e]);
    };
    for (const { m, w } of played) {
      add(scored, m.homeId, w * m.homeGoals!, w * homeGoals * defense.get(m.awayId)!);
      add(scored, m.awayId, w * m.awayGoals!, w * awayGoals * defense.get(m.homeId)!);
      add(conceded, m.homeId, w * m.awayGoals!, w * awayGoals * attack.get(m.awayId)!);
      add(conceded, m.awayId, w * m.homeGoals!, w * homeGoals * attack.get(m.homeId)!);
    }
    for (const t of teams) {
      const [g, e] = scored.get(t)!;
      attack.set(t, (g + k) / (e + k));
      const [c, ce] = conceded.get(t)!;
      defense.set(t, (c + k) / (ce + k));
    }
    normalize(attack);
    normalize(defense);
  }
  return { attack, defense, homeGoals, awayGoals, rho: options.rho };
}

function normalize(map: Map<TeamId, number>) {
  const mean = [...map.values()].reduce((a, b) => a + b, 0) / map.size;
  for (const [t, v] of map) map.set(t, v / mean);
}

/** Goles esperados. En cancha neutral no hay ventaja de local. Un equipo sin datos cuenta como promedio. */
export function expectedGoals(r: Ratings, home: TeamId, away: TeamId, neutral = false): [number, number] {
  const base = neutral ? Math.sqrt(r.homeGoals * r.awayGoals) : undefined;
  const att = (t: TeamId) => r.attack.get(t) ?? 1;
  const def = (t: TeamId) => r.defense.get(t) ?? 1;
  return [(base ?? r.homeGoals) * att(home) * def(away), (base ?? r.awayGoals) * att(away) * def(home)];
}

export const MAX_GOALS = 10;

/** Probabilidad de cada resultado: grid[i][j] = P(local i, visitante j), con i, j ≤ MAX_GOALS. */
export function scoreGrid(lambdaHome: number, lambdaAway: number, rho: number): number[][] {
  const ph = poisson(lambdaHome);
  const pa = poisson(lambdaAway);
  const grid = ph.map((h, i) => pa.map((a, j) => h * a * tau(i, j, lambdaHome, lambdaAway, rho)));
  const total = grid.flat().reduce((s, p) => s + p, 0);
  return grid.map((row) => row.map((p) => p / total));
}

function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOALS; k++) p.push((p[k - 1] * lambda) / k);
  return p;
}

function tau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return Math.max(0, 1 - lh * la * rho);
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** Probabilidades de local / empate / visitante. */
export function outcomeProbabilities(grid: number[][]): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  grid.forEach((row, i) =>
    row.forEach((p, j) => {
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }),
  );
  return { home, draw, away };
}
