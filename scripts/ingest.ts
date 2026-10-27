// Baja las temporadas con un DataProvider y escribe public/data/<competencia>/<año>.json.
// Uso: npm run ingest -- [años...]   (por defecto, las 3 temporadas de los promedios del año actual)
// Las copas (Copa Argentina, Libertadores, Sudamericana) se bajan solo para la temporada actual.
// Un archivo que no cambió no se reescribe (conserva su generatedAt), así git no ve cambios de más.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EspnProvider } from '../src/adapters/espn/EspnProvider.ts';
import { seasonDataSchema } from '../src/domain/schema.ts';
import { CUP_COMPETITIONS, type CompetitionId, type SeasonData } from '../src/domain/types.ts';
import { fnv1a } from '../src/engine/hash.ts';
import { inferRounds } from '../src/engine/rounds.ts';

const DATA_DIR = new URL('../public/data/', import.meta.url);
const currentYear = new Date().getFullYear();
const seasons = process.argv.slice(2).map(Number);
if (seasons.length === 0) seasons.push(currentYear - 2, currentYear - 1, currentYear);

const provider = new EspnProvider();
const contents: string[] = [];

async function ingest(competition: CompetitionId, season: number) {
  const raw = await provider.getSeason(competition, season);
  const data: SeasonData = seasonDataSchema.parse({
    competition,
    season,
    provider: provider.id,
    generatedAt: new Date().toISOString(),
    teams: raw.teams.sort((a, b) => a.name.localeCompare(b.name)),
    tournaments: raw.tournaments,
    matches: inferRounds(raw.matches).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  });
  const dir = new URL(`${competition}/`, DATA_DIR);
  const file = new URL(`${season}.json`, dir);
  await mkdir(dir, { recursive: true });

  const previous = await readFile(file, 'utf8').then((t) => JSON.parse(t) as SeasonData).catch(() => undefined);
  const withoutDate = (d: SeasonData) => JSON.stringify({ ...d, generatedAt: '' });
  const changed = !previous || withoutDate(previous) !== withoutDate(data);
  if (changed) await writeFile(file, format(data));
  contents.push(withoutDate(data));

  const pending = data.matches.filter((m) => m.status !== 'finished').length;
  console.log(`${competition} ${season}: ${data.teams.length} equipos, ${data.matches.length} partidos (${pending} sin terminar)${changed ? '' : ' · sin cambios'}`);
}

for (const season of seasons) await ingest('lpf', season);
for (const cup of CUP_COMPETITIONS) await ingest(cup, currentYear);

const index = {
  seasons: [currentYear - 2, currentYear - 1, currentYear],
  current: currentYear,
  cups: CUP_COMPETITIONS,
  /** Huella de todos los datos: si es igual a la del sitio publicado, no hace falta volver a publicar. */
  contentHash: fnv1a(contents.join('\n')),
  updatedAt: new Date().toISOString(),
};
await writeFile(new URL('lpf/index.json', DATA_DIR), JSON.stringify(index, null, 2) + '\n');

/** JSON legible pero compacto: un partido por línea, para que los diffs en git sean chicos. */
function format(data: SeasonData): string {
  const { matches, ...rest } = data;
  const head = JSON.stringify({ ...rest, matches: [] }, null, 2).replace(/\[\]\n}$/, '');
  return `${head}[\n${matches.map((m) => '    ' + JSON.stringify(m)).join(',\n')}\n  ]\n}\n`;
}
