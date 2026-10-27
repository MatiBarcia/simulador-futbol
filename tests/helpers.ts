import { readFileSync } from 'node:fs';
import { EspnProvider } from '../src/adapters/espn/EspnProvider.ts';

/** EspnProvider que lee los fixtures guardados en vez de ir a la red. */
export function fixtureProvider() {
  return new EspnProvider({
    warn: () => {},
    fetchJson: async <T>(url: string) => {
      const m = /soccer\/([^/]+)\/(scoreboard|standings)\?(?:dates|season)=(\d{4})/.exec(url);
      if (!m) throw new Error(`URL sin fixture: ${url}`);
      return readFixture<T>(`${m[1]}-${m[2]}-${m[3]}.json`);
    },
  });
}

export const readFixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/espn/${name}`, import.meta.url), 'utf8')) as T;
