import { useEffect, useMemo, useState } from 'react';
import type { SeasonData } from '../domain/types.ts';
import { simulationInputHash, type PrecomputedSimulation } from '../engine/precomputed.ts';

/**
 * La simulación calculada en la nube (data/lpf/simulation.json). Devuelve undefined si no existe
 * o si se calculó con datos distintos a los que tiene la página (entonces se simula en el dispositivo).
 */
export function usePrecomputed(seasons: SeasonData[], cups: SeasonData[]): { precomputed?: PrecomputedSimulation; checked: boolean } {
  const [loaded, setLoaded] = useState<{ data?: PrecomputedSimulation; checked: boolean }>({ checked: false });
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/lpf/simulation.json`)
      .then((res) => (res.ok ? (res.json() as Promise<PrecomputedSimulation>) : undefined))
      .catch(() => undefined)
      .then((data) => {
        if (!cancelled) setLoaded({ data: data?.version === 1 ? data : undefined, checked: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const hash = useMemo(() => simulationInputHash(seasons, cups), [seasons, cups]);
  return { precomputed: loaded.data?.basedOn === hash ? loaded.data : undefined, checked: loaded.checked };
}
