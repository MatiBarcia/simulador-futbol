// Guarda respuestas reales de ESPN en tests/fixtures/espn/, recortadas a los campos que usa el adapter.
// Uso: node scripts/save-fixtures.ts
import { mkdir, writeFile } from 'node:fs/promises';
import type { EspnEvent, EspnScoreboard, EspnStandings, EspnTeam } from '../src/adapters/espn/types.ts';

const OUT_DIR = new URL('../tests/fixtures/espn/', import.meta.url);
const BASE = 'https://site.api.espn.com/apis';
const FILES: [string, string, number][] = [
  ['arg.copa_lpf', 'scoreboard', 2024],
  ['arg.copa_lpf', 'standings', 2024],
  ['arg.1', 'scoreboard', 2024],
  ['arg.1', 'standings', 2024],
  ['arg.1', 'scoreboard', 2025],
  ['arg.1', 'standings', 2025],
  ['arg.1', 'scoreboard', 2026],
  ['arg.1', 'standings', 2026],
  ['arg.copa', 'scoreboard', 2026],
  ['conmebol.libertadores', 'scoreboard', 2026],
  ['conmebol.sudamericana', 'scoreboard', 2026],
  ['arg.supercopa', 'scoreboard', 2026],
];

const team = (t: EspnTeam): EspnTeam => ({ id: t.id, displayName: t.displayName, shortDisplayName: t.shortDisplayName, logo: t.logo });

const trimEvent = (e: EspnEvent): EspnEvent => ({
  id: e.id,
  date: e.date,
  season: { year: e.season.year, slug: e.season.slug },
  status: {
    displayClock: e.status.displayClock,
    type: { name: e.status.type.name, state: e.status.type.state, shortDetail: e.status.type.shortDetail },
  },
  competitions: [
    {
      competitors: e.competitions[0].competitors.map((c) => ({
        homeAway: c.homeAway,
        score: c.score,
        ...(c.shootoutScore !== undefined ? { shootoutScore: c.shootoutScore } : {}),
        team: team(c.team),
      })),
    },
  ],
});

await mkdir(OUT_DIR, { recursive: true });
for (const [league, kind, season] of FILES) {
  const url =
    kind === 'scoreboard'
      ? `${BASE}/site/v2/sports/soccer/${league}/scoreboard?dates=${season}&limit=1000`
      : `${BASE}/v2/sports/soccer/${league}/standings?season=${season}`;
  const json = await (await fetch(url)).json();
  const trimmed =
    kind === 'scoreboard'
      ? { events: (json as EspnScoreboard).events.map(trimEvent) }
      : {
          children: (json as EspnStandings).children?.map((g) => ({
            name: g.name,
            standings: { entries: g.standings.entries.map((e) => ({ team: team(e.team), stats: e.stats.map((s) => ({ name: s.name, value: s.value })) })) },
          })),
        };
  await writeFile(new URL(`${league}-${kind}-${season}.json`, OUT_DIR), JSON.stringify(trimmed));
  console.log(`${league} ${kind} ${season}`);
}
