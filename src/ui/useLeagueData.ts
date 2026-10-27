import { useEffect, useState } from 'react';
import { parseSeasonData } from '../domain/schema.ts';
import type { SeasonData } from '../domain/types.ts';

interface DataIndex {
  seasons: number[];
  current: number;
  cups?: string[];
  updatedAt: string;
}

export type LeagueData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; seasons: SeasonData[]; cups: SeasonData[]; current: number; updatedAt: string };

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`${res.status} al cargar ${path}`);
  return res.json();
}

export function useLeagueData(): LeagueData {
  const [state, setState] = useState<LeagueData>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const index = (await getJson('lpf/index.json')) as DataIndex;
      const [seasons, cups] = await Promise.all([
        Promise.all(index.seasons.map(async (s) => parseSeasonData(await getJson(`lpf/${s}.json`)))),
        Promise.all((index.cups ?? []).map(async (c) => parseSeasonData(await getJson(`${c}/${index.current}.json`)))),
      ]);
      if (!cancelled) setState({ status: 'ready', seasons, cups, current: index.current, updatedAt: index.updatedAt });
    })().catch((e: unknown) => {
      if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
