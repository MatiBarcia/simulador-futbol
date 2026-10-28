import { useEffect, useMemo, useRef, useState } from 'react';
import { createProvider } from '../adapters/index.ts';
import { parseSeasonData } from '../domain/schema.ts';
import type { Match, SeasonData } from '../domain/types.ts';
import { applyLive, daysToCheck } from '../engine/live.ts';

interface DataIndex {
  seasons: number[];
  current: number;
  cups?: string[];
  updatedAt: string;
}

export type LeagueData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      seasons: SeasonData[];
      cups: SeasonData[];
      current: number;
      /** Cuándo se publicaron los datos por última vez (solo se publica cuando algo cambió). */
      publishedAt: string;
      /** Última consulta de resultados del día hecha desde la página, si hubo. */
      liveAt?: string;
    };

/** Cada cuánto se revisa si hay partidos en juego o por empezar (y, si hay, se consulta a ESPN). */
const POLL_MS = 30_000;

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`${res.status} al cargar ${path}`);
  return res.json();
}

/**
 * Los datos publicados (se actualizan cada algunos minutos) más los resultados del día, que se consultan directo a la fuente
 * mientras haya partidos en juego o por empezar. Con la pestaña oculta no se consulta.
 */
export function useLeagueData(): LeagueData {
  const [base, setBase] = useState<LeagueData>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const index = (await getJson('lpf/index.json')) as DataIndex;
      const [seasons, cups] = await Promise.all([
        Promise.all(index.seasons.map(async (s) => parseSeasonData(await getJson(`lpf/${s}.json`)))),
        Promise.all((index.cups ?? []).map(async (c) => parseSeasonData(await getJson(`${c}/${index.current}.json`)))),
      ]);
      if (!cancelled) setBase({ status: 'ready', seasons, cups, current: index.current, publishedAt: index.updatedAt });
    })().catch((e: unknown) => {
      if (!cancelled) setBase({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [live, setLive] = useState<{ matches: ReadonlyMap<string, Match>; at?: string }>({ matches: new Map() });
  const data = useMemo<LeagueData>(() => {
    if (base.status !== 'ready') return base;
    return {
      ...base,
      seasons: base.seasons.map((s) => applyLive(s, live.matches)),
      cups: base.cups.map((c) => applyLive(c, live.matches)),
      liveAt: live.at,
    };
  }, [base, live]);

  // La consulta mira los datos ya mezclados: cuando un partido figura terminado, se deja de consultar.
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  useEffect(() => {
    if (base.status !== 'ready') return;
    const provider = createProvider();
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };
    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const current = latest.current;
        if (current.status === 'ready' && !document.hidden) {
          const season = current.seasons.filter((s) => s.season === current.current);
          const checks = daysToCheck([...season, ...current.cups], new Date());
          if (checks.length) {
            const results = await Promise.all(checks.map((c) => provider.getMatchesOn(c.competition, c.season, c.days)));
            if (!cancelled) {
              setLive((prev) => {
                const matches = new Map(prev.matches);
                for (const m of results.flat()) matches.set(m.id, m);
                return { matches, at: new Date().toISOString() };
              });
            }
          }
        }
      } catch {
        // Sin conexión o la fuente no responde: se reintenta en la próxima vuelta.
      } finally {
        running = false;
        if (!cancelled) schedule(POLL_MS);
      }
    };
    const onVisibility = () => {
      if (!document.hidden) schedule(0);
    };
    schedule(0);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [base]);

  return data;
}
