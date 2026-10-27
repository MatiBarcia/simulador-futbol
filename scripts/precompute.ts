// Corre la simulación completa y guarda lo que muestra la página en public/data/lpf/simulation.json.
// Uso: npm run precompute -- [--previous <archivo o URL de un simulation.json anterior>]
// Si el anterior se calculó con los mismos datos, se reutiliza y no se simula de nuevo.
import { readFile, writeFile } from 'node:fs/promises';
import { parseSeasonData } from '../src/domain/schema.ts';
import { precompute, PRECOMPUTED_VERSION, simulationInputHash, type PrecomputedSimulation } from '../src/engine/precomputed.ts';
import { createSimulation, mergeResults, type SimulationResult } from '../src/engine/simulate.ts';

const ITERATIONS = 200_000;
const BATCH = 10_000;

const DATA_DIR = new URL('../public/data/', import.meta.url);
const OUT = new URL('lpf/simulation.json', DATA_DIR);
const readJson = async (path: string) => JSON.parse(await readFile(new URL(path, DATA_DIR), 'utf8')) as unknown;

const index = (await readJson('lpf/index.json')) as { seasons: number[]; current: number; cups?: string[] };
const seasons = await Promise.all(index.seasons.map(async (s) => parseSeasonData(await readJson(`lpf/${s}.json`))));
const cups = await Promise.all((index.cups ?? []).map(async (c) => parseSeasonData(await readJson(`${c}/${index.current}.json`))));
const basedOn = simulationInputHash(seasons, cups);

const previousArg = process.argv.indexOf('--previous');
const previous = previousArg > 0 ? await loadPrevious(process.argv[previousArg + 1]) : undefined;
if (previous?.basedOn === basedOn && previous.iterations >= ITERATIONS) {
  await writeFile(OUT, JSON.stringify(previous));
  console.log(`Sin cambios en los resultados (${basedOn}): se reutiliza la simulación del ${previous.generatedAt}.`);
  process.exit(0);
}

const start = performance.now();
const simulation = createSimulation({ seasons, cups, season: index.current, fixed: {} });
let result: SimulationResult | undefined;
while ((result?.iterations ?? 0) < ITERATIONS) {
  const batch = simulation.run(BATCH);
  result = result ? mergeResults(result, batch) : batch;
}
const simulated = performance.now();
const output = precompute(result!, basedOn);
await writeFile(OUT, JSON.stringify(output));
console.log(
  `${result!.iterations.toLocaleString('es-AR')} simulaciones en ${((simulated - start) / 1000).toFixed(1)} s, ` +
    `análisis en ${((performance.now() - simulated) / 1000).toFixed(1)} s (${basedOn}).`,
);

async function loadPrevious(source: string | undefined): Promise<PrecomputedSimulation | undefined> {
  if (!source) return undefined;
  try {
    const text = /^https?:/.test(source) ? await (await fetch(source)).text() : await readFile(source, 'utf8');
    const json = JSON.parse(text) as PrecomputedSimulation;
    return json.version === PRECOMPUTED_VERSION ? json : undefined;
  } catch {
    return undefined; // primera vez, o el sitio todavía no existe
  }
}
