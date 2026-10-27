import { useEffect, useState } from 'react';
import { parseSeasonData } from '../domain/schema.ts';
import type { SeasonData } from '../domain/types.ts';

interface DataIndex {
  seasons: number[];
  current: number;
  updatedAt: string;
}

export type LeagueData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; seasons: SeasonData[]; current: number; updatedAt: string };

const url = (path: string) => `${import.meta.env.BASE_URL}data/lpf/${path}`;

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`${res.status} al cargar ${path}`);
  return res.json();
}

export function useLeagueData(): LeagueData {
  const [state, setState] = useState<LeagueData>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const index = (await getJson('index.json')) as DataIndex;
      const seasons = await Promise.all(index.seasons.map(async (s) => parseSeasonData(await getJson(`${s}.json`))));
      if (!cancelled) setState({ status: 'ready', seasons, current: index.current, updatedAt: index.updatedAt });
    })().catch((e: unknown) => {
      if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
