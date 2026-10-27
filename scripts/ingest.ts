// Baja las temporadas con un DataProvider y escribe public/data/lpf/<año>.json.
// Uso: npm run ingest -- [años...]   (por defecto, las 3 temporadas de los promedios del año actual)
import { mkdir, writeFile } from 'node:fs/promises';
import { EspnProvider } from '../src/adapters/espn/EspnProvider.ts';
import { seasonDataSchema } from '../src/domain/schema.ts';
import type { SeasonData } from '../src/domain/types.ts';
import { inferRounds } from '../src/engine/rounds.ts';

const OUT_DIR = new URL('../public/data/lpf/', import.meta.url);
const currentYear = new Date().getFullYear();
const seasons = process.argv.slice(2).map(Number);
if (seasons.length === 0) seasons.push(currentYear - 2, currentYear - 1, currentYear);

const provider = new EspnProvider();
await mkdir(OUT_DIR, { recursive: true });

for (const season of seasons) {
  const raw = await provider.getSeason('lpf', season);
  const data: SeasonData = seasonDataSchema.parse({
    competition: 'lpf',
    season,
    provider: provider.id,
    generatedAt: new Date().toISOString(),
    teams: raw.teams.sort((a, b) => a.name.localeCompare(b.name)),
    tournaments: raw.tournaments,
    matches: inferRounds(raw.matches).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  });
  await writeFile(new URL(`${season}.json`, OUT_DIR), format(data));
  const pending = data.matches.filter((m) => m.status !== 'finished').length;
  console.log(`${season}: ${data.teams.length} equipos, ${data.matches.length} partidos (${pending} sin terminar)`);
}

const index = { seasons: [currentYear - 2, currentYear - 1, currentYear], current: currentYear, updatedAt: new Date().toISOString() };
await writeFile(new URL('index.json', OUT_DIR), JSON.stringify(index, null, 2) + '\n');

/** JSON legible pero compacto: un partido por línea, para que los diffs en git sean chicos. */
function format(data: SeasonData): string {
  const { matches, ...rest } = data;
  const head = JSON.stringify({ ...rest, matches: [] }, null, 2).replace(/\[\]\n}$/, '');
  return `${head}[\n${matches.map((m) => '    ' + JSON.stringify(m)).join(',\n')}\n  ]\n}\n`;
}
