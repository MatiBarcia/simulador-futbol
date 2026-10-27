// Calibra el modelo de goles con validación hacia adelante: para cada partido jugado desde julio de 2025,
// ajusta el modelo solo con lo anterior y mide qué tan bien predijo el resultado (log-loss del 1X2).
// Uso: node scripts/calibrate.ts
import { readFileSync } from 'node:fs';
import { fitRatings, expectedGoals, scoreGrid, outcomeProbabilities } from '../src/engine/model.ts';
const load = (y: number) => JSON.parse(readFileSync(new URL(`../public/data/lpf/${y}.json`, import.meta.url), 'utf8')).matches;
const all = [...load(2024), ...load(2025), ...load(2026)];
const regular = all.filter((m: any) => m.phase === 'regular' && m.status === 'finished');
// Test: partidos de fase regular desde 2025-07-01, refit cada 14 días (walk-forward).
const test = regular.filter((m: any) => m.date >= '2025-07-01');
function evaluate(halfLifeDays: number, priorGoals: number, rho: number) {
  let ll = 0, n = 0, pd = 0, ad = 0, brier = 0;
  let cache: any = null, cacheKey = '';
  for (const m of test) {
    const key = m.date.slice(0, 7) + (Number(m.date.slice(8, 10)) < 15 ? 'a' : 'b');
    if (key !== cacheKey) { cache = fitRatings(all, { asOf: new Date(Date.parse(m.date) - 3600e3).toISOString(), halfLifeDays, priorGoals, rho }); cacheKey = key; }
    const [lh, la] = expectedGoals(cache, m.homeId, m.awayId);
    const p = outcomeProbabilities(scoreGrid(lh, la, rho));
    const o = m.homeGoals > m.awayGoals ? 'home' : m.homeGoals === m.awayGoals ? 'draw' : 'away';
    ll -= Math.log((p as any)[o]); n++; pd += p.draw; ad += o === 'draw' ? 1 : 0;
    for (const k of ['home','draw','away']) brier += ((p as any)[k] - (k === o ? 1 : 0)) ** 2;
  }
  return { halfLifeDays, priorGoals, rho, logloss: +(ll / n).toFixed(4), brier: +(brier/n).toFixed(4), predDraw: +(pd / n).toFixed(3), actualDraw: +(ad / n).toFixed(3), n };
}
// baseline: frecuencias globales
{ const h = regular.filter((m:any)=>m.homeGoals>m.awayGoals).length/regular.length, d = regular.filter((m:any)=>m.homeGoals===m.awayGoals).length/regular.length;
  let ll=0; for (const m of test){const o=m.homeGoals>m.awayGoals?h:m.homeGoals===m.awayGoals?d:1-h-d; ll-=Math.log(o);} console.log('baseline', (ll/test.length).toFixed(4), {h:h.toFixed(3), d:d.toFixed(3)}); }
const rows = [];
for (const hl of [120, 240, 365, 730]) for (const k of [4, 8, 16]) for (const rho of [0, -0.04, -0.08]) rows.push(evaluate(hl, k, rho));
rows.sort((a, b) => a.logloss - b.logloss); console.table(rows.slice(0, 12));
